from odoo import api, fields, models

class PosConfig(models.Model):
    _inherit = "pos.config"
    
    supervisor_pin = fields.Char(related="branch_id.supervisor_pin")





