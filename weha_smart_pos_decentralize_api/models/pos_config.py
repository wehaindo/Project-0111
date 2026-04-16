from odoo import models, fields, api, _ 
import string
import random

class PosConfig(models.Model):
    _inherit = 'pos.config'

    def generate_code(self):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k = 10))  
        self.pos_config_code = code

    pos_config_code = fields.Char('Code #', size=20)

    @api.model
    def create(self, vals):
        res = super(PosConfig, self).create(vals)
        res.generate_code()
        return res

    def write(self, vals):
        super(PosConfig, self).write(vals)
        if not self.pos_config_code:
            self.generate_code()