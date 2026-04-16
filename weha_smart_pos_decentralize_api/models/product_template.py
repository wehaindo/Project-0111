from odoo import models, fields, api, _ 
import string


class ProductTemplate(models.Model):
    _inherit = 'product.template'



class ProductProduct(models.Model):
    _inherit = 'product.product'