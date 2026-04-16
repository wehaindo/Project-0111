from odoo import models, fields, api, _ 
import string


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.model
    def create_from_ui(self, data):
        purchase_order = env['purchase.order'].create({
            'partner_id': vendor.id,            
        })
