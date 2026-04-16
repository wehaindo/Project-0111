from odoo import api, fields, models

import simplejson as json
from datetime import datetime, date
import uuid
import requests
from requests.auth import HTTPBasicAuth
import threading

import logging
_logger = logging.getLogger(__name__)

class ProductTemplate(models.Model):
    _inherit = "product.template"

    def action_sync_product(self):
        _logger.info("action_sync_product")
        for row in self:            
            product_product_id = self.env['product.product'].search([('product_tmpl_id','=', self.id)], limit=1)
            if product_product_id:
                row.generate_product_json()
                row.sync_product()

    def _prepare_product_json(self):
        _logger.info("Prepare Product Json")
        def json_serial(obj):
            """JSON serializer for objects not serializable by default json code"""
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            raise TypeError ("Type %s not serializable" % type(obj))
        
        domain = [
            ('product_tmpl_id','=', self.id)
        ]  
        _logger.info(domain)
        product_product_id = self.env['product.product'].search(domain, limit=1) 
        _logger.info(product_product_id)
        products = self.env['pos.session'].with_context({'product_id': product_product_id})._load_model('product.product.by.product.id')
        _logger.info('products')
        _logger.info(products)        
        product = products[0]
        if '__last_update' in product:
            del product['__last_update']
        
        domain  = [            
            ('product_template_id','=', self.id)
        ]
        product_template_couchdb_id = self.env['product.template.couchdb'].search(domain,limit=1)
        
        if not product_template_couchdb_id:
            product_couchdb_id = "product_" + str(uuid.uuid4())
            product['_id'] =  product_couchdb_id           
        else:
            product['_id'] =  product_template_couchdb_id.product_couchdb_id
            product_couchdb_id = product_template_couchdb_id.product_couchdb_id
           
        return product_template_couchdb_id, product_couchdb_id, product
    
    def generate_product_json(self):
        _logger.info("Generate Product Json")
        def json_serial(obj):
            """JSON serializer for objects not serializable by default json code"""
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            raise TypeError ("Type %s not serializable" % type(obj))

        product_template_couchdb_id, product_couchdb_id, product = self._prepare_product_json()
        products_json = json.dumps(product, default=json_serial)
        _logger.info(products_json)            

        if not product_template_couchdb_id:
            vals = {                
                'product_template_id': self.id,
                'product_couchdb_sync': False,
                'product_json': products_json,
                'product_couchdb_id': product_couchdb_id,
            }
            res = self.env['product.template.couchdb'].create(vals)
        else:
            vals = {
                'product_couchdb_sync': False,
                'product_json': products_json,
                'product_couchdb_id': product_couchdb_id,
            }
            product_template_couchdb_id.write(vals)

    def sync_product(self):        
        auth = HTTPBasicAuth('admin','pelang1')
        headers = {
            'Content-Type': 'application/json'                  
        }                
            
        for product_template_data_id in self.product_template_data_ids:
            if product_template_data_id.product_couchdb_id:
                _logger.info("Have Product Couchdb ID")
                _logger.info(product_template_data_id.product_couchdb_id)
                try:
                    url = f'https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products/{product_template_data_id.product_couchdb_id}'
                    response = requests.get(url, auth=auth, headers=headers, verify=False)
                    _logger.info(response.status_code)
                    if response.status_code == 200:
                        _logger.info("Product Found")
                        json_data = response.json()
                        if isinstance(json_data, dict):
                            couchdb_product = json_data
                        if isinstance(json_data, list):
                            couchdb_product = json_data[0]
                        #Update Product
                        _logger.info(couchdb_product)                                
                        # product_json = self._update_rev(product_template_data_id.product_json, couchdb_product['_rev'])
                        product_json = product_template_data_id.product_json
                        url = f'https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products/{couchdb_product["_id"]}'
                        response = requests.put(url, auth=auth, headers=headers, data=product_json, verify=False)
                        if response.status_code == 200:
                            pass
                        if response.status_code == 201:                    
                            json_data = response.json()
                            _logger.info(json_data)
                        else:
                            pass
                    elif response.status_code == 404:
                        _logger.info("Product CouchDB Not Found then create new one")
                        url = f'https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products'
                        response = requests.post(url, auth=auth, headers=headers, data=product_template_data_id.product_json, verify=False)        
                        _logger.info(response.status_code)
                        if response.status_code == 200:
                            pass
                        if response.status_code == 201:
                            json_data = response.json()
                            _logger.info(json_data)
                except requests.exceptions.HTTPError as errh:
                    _logger.error("Error")
                    _logger.error(errh)
            else:
                _logger.info("Have no Product Couchdb ID")      
                try:
                    url = f'https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products'
                    response = requests.post(url, auth=auth, headers=headers, data=product_template_data_id.product_json, verify=False)    
                    if response.status_code == 200:
                        pass
                    if response.status_code == 201:
                        json_data = response.json()
                        _logger.info(json_data)
                except requests.exceptions.HTTPError as errh:
                    _logger.error("Error")
                    _logger.error(errh)

    product_template_data_ids  = fields.One2many('product.template.couchdb', 'product_template_id', 'Product Template Couchdbs')

    @api.model
    def create(self, vals):
        res = super().create(vals)        
        context = self.env.context
        res.action_sync_product()        
        return res

    def write(self, vals):
        res = super(ProductTemplate, self).write(vals)
        self.action_sync_product()
        return res
    
    def unlink(self):
        pass

class ProductTemplateCouchdb(models.Model):
    _name = 'product.template.couchdb'
        
    product_template_id = fields.Many2one('product.template', 'Product Template #')    
    product_couchdb_sync = fields.Boolean('Is Sync', default=False)
    product_json = fields.Text('Product JSON')
    product_couchdb_id = fields.Text('CouchDB Id')
    product_couchdb_rev = fields.Text('CouchDB Rev')