from odoo import api, fields, models

class ResBranch(models.Model):
    _inherit = 'res.branch'
    
    supervisor_pin = fields.Char('Supervisor PIN')    
