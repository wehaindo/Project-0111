from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from odoo.osv.expression import AND, OR
from odoo.service.common import exp_version

import simplejson as json
import base64
# from lzstring import LZString
from datetime import datetime, date
import requests
from requests.auth import HTTPBasicAuth
import threading

import logging
_logger = logging.getLogger(__name__)

class PosSession(models.Model):
    _inherit = 'pos.session'
   
    # def _load_model(self, model):
    #     model_name = model.replace('.', '_')
    #     loader = getattr(self, '_get_pos_ui_%s' % model_name, None)
    #     params = getattr(self, '_loader_params_%s' % model_name, None)
    #     if loader and params:
    #         return loader(params())
    #     else:
    #         raise NotImplementedError(_("The function to load %s has not been implemented.", model))

    # def _loader_params_product_product_by_product_id(self):
    #     _logger.info("_loader_params_product_product_by_product_id")
    #     product_id = self.env.context.get('product_id')                
    #     domain = [('id','=', product_id.id)]
    #     fields = ['display_name', 'lst_price', 'standard_price', 'categ_id', 'pos_categ_id', 'taxes_id',
    #              'barcode', 'default_code', 'to_weight', 'uom_id', 'description_sale', 'description',
    #              'product_tmpl_id','tracking']                 
    #     result = {
    #         'search_params': {
    #             'domain':domain,
    #             'fields': fields
    #         }
    #     }           
    #     return result

    # def _get_pos_ui_product_product_by_product_id(self, params):
    #     # self = self.with_context(**params['context'])
    #     products = self.env['product.product'].search_read(**params['search_params'])
    #     # self._process_pos_ui_product_product_by_product_id(products)
    #     return products

    @api.model
    def pong(self, check):
        return {
            "err": False,
            "message": "PONG",
            "data": []
        }
    
    # def _process_pos_ui_product_product(self, products):
    #     """
    #     Modify the list of products to add the categories as well as adapt the lst_price
    #     :param products: a list of products
    #     """
    #     if self.config_id.currency_id != self.company_id.currency_id:
    #         for product in products:
    #             product['lst_price'] = self.company_id.currency_id._convert(product['lst_price'], self.config_id.currency_id,
    #                                                                         self.company_id, fields.Date.today())
    #     categories = self._get_pos_ui_product_category(self._loader_params_product_category())
    #     product_category_by_id = {category['id']: category for category in categories}
    #     for product in products:
    #         product['categ'] = product_category_by_id[product['categ_id'][0]]
    #         product['image_128'] = bool(product['image_128'])


