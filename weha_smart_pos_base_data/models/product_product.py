from odoo import api, fields, models

import simplejson as json
from datetime import datetime, date
import uuid
import requests
from requests.auth import HTTPBasicAuth
import threading

import logging
_logger = logging.getLogger(__name__)

class ProductProduct(models.Model):
    _inherit = "product.product"
        
    
    @api.model
    def get_pricelist_item(self, product_id, pricelist_id):
        product = self.browse(product_id)
        pricelist = self.env['product.pricelist'].browse(pricelist_id)

        if not product or not pricelist:
            return product.lst_price  # Return default price if no valid pricelist

        # Get price using pricelist logic
        price = pricelist.get_product_price(product, 1.0, None)  # Quantity = 1.0
        return price
    
    
    @api.model
    def get_product_by_barcode_with_available_pricelist(self, barcode, pricelist_id):
        product = {}
        product_id = self.env['product.product'].search([('barcode','=',barcode)], limit=1)
        if not product_id:
            return False
        
        domain = [
            ('pricelist_id','=', pricelist_id),
            ('product_id','=', product_id.id)
        ]
        
        product.update(
            {
                "id": product_id.id,
                "display_name": product_id.name,
                "lst_price": product_id.lst_price,
                "standard_price": product_id.standard_price,
                "categ_id": [
                    product_id.categ_id.id,
                    product_id.categ_id.name
                ],
                "pos_categ_id": False,
                "taxes_id": product_id.taxes_id.ids,                  
                "barcode": product_id.barcode,
                "default_code": product_id.default_code,
                "to_weight": product_id.to_weight,
                "uom_id": [
                    product_id.uom_id.id,
                    product_id.uom_id.name
                ],
                "description_sale": product_id.description_sale,
                "description": product_id.description,
                "product_tmpl_id": [
                    product_id.product_tmpl_id.id,
                    product_id.product_tmpl_id.name
                ],
                "tracking": "none",
                "qty_available": product_id.qty_available
            }
        )    
        pricelist_items = self.env['product.pricelist.item'].search(domain)
        available_pricelist_items = []
        for pricelist_item in pricelist_items:
            var = {
                "id": pricelist_item.id,
                "product_tmpl_id": [
                    pricelist_item.product_id.product_tmpl_id.id,
                    pricelist_item.product_id.product_tmpl_id.name
                ],
                "product_id": [
                    pricelist_item.product_id.id,
                    pricelist_item.product_id.name
                ],
                "categ_id": False,
                "min_quantity": pricelist_item.min_quantity,
                "base": pricelist_item.base,
                "pricelist_id": [
                    pricelist_item.pricelist_id.id,
                    pricelist_item.pricelist_id.name
                ],
                "price_surcharge": pricelist_item.price_surcharge,
                "price_discount": pricelist_item.price_discount,
                "price_round": pricelist_item.price_round,
                "price_min_margin": pricelist_item.price_min_margin,
                "price_max_margin": pricelist_item.price_max_margin,          
                "company_id": [
                    pricelist_item.company_id.id,
                    pricelist_item.company_id.name,
                ],
                "currency_id": [
                    pricelist_item.currency_id.id,
                    pricelist_item.currency_id.name,
                ],
                "active": pricelist_item.active,
                "date_start": pricelist_item.date_start and pricelist_item.date_start.strftime('%Y-%m-%d %H:%M:%S') or False,
                "date_end": pricelist_item.date_end and pricelist_item.date_end.strftime('%Y-%m-%d %H:%M:%S') or False,
                "compute_price": pricelist_item.compute_price,
                "fixed_price": pricelist_item.fixed_price,
                "percent_price": pricelist_item.percent_price,
                "name": pricelist_item.name,
                "price": pricelist_item.price,
                "offer_msg": pricelist_item.offer_msg,
                "is_display_timer": pricelist_item.is_display_timer,
                "branch_id": [
                    pricelist_item.branch_id.id,
                    pricelist_item.branch_id.name
                ],
                "department_id": [
                    pricelist_item.department_id.id,
                    pricelist_item.department_id.name,
                ],
                # "vendor_product_id": [
                #     pricelist_item.vendor_product_id.id,
                #     pricelist_item.vendor_product_id.name,
                # ],
                "display_name": pricelist_item.display_name,
            }
            _logger.info(var)
            available_pricelist_items.append(var)
            
        product.update({
            'available_pricelist_items': available_pricelist_items
        })

        return json.dumps(product)
    
    
    @api.model
    def get_product_by_id_with_available_pricelist(self, product_id, pricelist_id):
        product = {}
        product_id = self.env['product.product'].browse(product_id)
        if not product_id:
            return False
        
        domain = [
            ('pricelist_id','=', pricelist_id),
            ('product_id','=', product_id.id)
        ]
        
        product.update(
            {
                "id": product_id.id,
                "display_name": product_id.name,
                "lst_price": product_id.lst_price,
                "standard_price": product_id.standard_price,
                "categ_id": [
                    product_id.categ_id.id,
                    product_id.categ_id.name
                ],
                "pos_categ_id": False,
                "taxes_id": product_id.taxes_id.ids,                  
                "barcode": product_id.barcode,
                "default_code": product_id.default_code,
                "to_weight": product_id.to_weight,
                "uom_id": [
                    product_id.uom_id.id,
                    product_id.uom_id.name
                ],
                "description_sale": product_id.description_sale,
                "description": product_id.description,
                "product_tmpl_id": [
                    product_id.product_tmpl_id.id,
                    product_id.product_tmpl_id.name
                ],
                "tracking": "none",
                "qty_available": product_id.qty_available
            }
        )    
        pricelist_items = self.env['product.pricelist.item'].search(domain)
        available_pricelist_items = []
        for pricelist_item in pricelist_items:
            var = {
                "id": pricelist_item.id,
                "product_tmpl_id": [
                    pricelist_item.product_id.product_tmpl_id.id,
                    pricelist_item.product_id.product_tmpl_id.name
                ],
                "product_id": [
                    pricelist_item.product_id.id,
                    pricelist_item.product_id.name
                ],
                "categ_id": False,
                "min_quantity": pricelist_item.min_quantity,
                "base": pricelist_item.base,
                "pricelist_id": [
                    pricelist_item.pricelist_id.id,
                    pricelist_item.pricelist_id.name
                ],
                "price_surcharge": pricelist_item.price_surcharge,
                "price_discount": pricelist_item.price_discount,
                "price_round": pricelist_item.price_round,
                "price_min_margin": pricelist_item.price_min_margin,
                "price_max_margin": pricelist_item.price_max_margin,          
                "company_id": [
                    pricelist_item.company_id.id,
                    pricelist_item.company_id.name,
                ],
                "currency_id": [
                    pricelist_item.currency_id.id,
                    pricelist_item.currency_id.name,
                ],
                "active": pricelist_item.active,
                "date_start": pricelist_item.date_start and pricelist_item.date_start.strftime('%Y-%m-%d %H:%M:%S') or False,
                "date_end": pricelist_item.date_end and pricelist_item.date_end.strftime('%Y-%m-%d %H:%M:%S') or False,
                "compute_price": pricelist_item.compute_price,
                "fixed_price": pricelist_item.fixed_price,
                "percent_price": pricelist_item.percent_price,
                "name": pricelist_item.name,
                "price": pricelist_item.price,
                "offer_msg": pricelist_item.offer_msg,
                "is_display_timer": pricelist_item.is_display_timer,
                "branch_id": [
                    pricelist_item.branch_id.id,
                    pricelist_item.branch_id.name
                ],
                "department_id": [
                    pricelist_item.department_id.id,
                    pricelist_item.department_id.name,
                ],
                # "vendor_product_id": [
                #     pricelist_item.vendor_product_id.id,
                #     pricelist_item.vendor_product_id.name,
                # ],
                "display_name": pricelist_item.display_name,
            }
            _logger.info(var)
            available_pricelist_items.append(var)
            
        product.update({
            'available_pricelist_items': available_pricelist_items
        })

        return json.dumps(product)


        
        
            