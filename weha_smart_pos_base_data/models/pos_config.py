from odoo import api, fields, models

class PosConfig(models.Model):
    _inherit = "pos.config"
    
    use_pos_data_speed_up = fields.Boolean('Use POS Data Speed Up')
    save_pos_order = fields.Boolean('Save POS Order Locally')
    couchdb_product_pricelist_items = fields.Char('Couchdb Product Pricelist Items')
    
    enable_pos_online = fields.Boolean('enable POS Online')
    enable_product_online = fields.Boolean('Enable Product Online')
    enable_pricelist_item_online = fields.Boolean('Enable Pricelist Item Online')
    enable_promotion_online = fields.Boolean('Enable Promotion Online')





