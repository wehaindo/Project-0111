from odoo import api, fields, models

class PosConfig(models.Model):
    _inherit = "pos.config"
    
    enable_pos_online = fields.Boolean('enable POS Online')
    enable_product_online = fields.Boolean('Enable Product Online')
    enable_pricelist_item_online = fields.Boolean('Enable Pricelist Item Online')
    enable_promotion_online = fields.Boolean('Enable Promotion Online')





