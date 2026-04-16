# -*- coding: utf-8 -*-
###############################################################################
#    License, author and contributors information in:                         #
#    __manifest__.py file at the root folder of this module.                  #
###############################################################################

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import datetime, timedelta

class PosOrder(models.Model):
    _inherit = 'pos.order'
    
    # @api.depends('date_order')    
    # def get_allow_to_exchange(self):
    #     for row in self:
    #         if row.date_order >=  datetime.now() + timedelta(days=-7)            
    #             row.is_allow_to_exchange = True
    #         else:
    #             row.is_allow_to_exchange = False
    
    # is_allow_to_exchange = fields.Boolean('Still Allow to Exchange', compute="get_allow_to_exchange")
    
    @api.model
    def search_order_by_pos_reference(self, config_data, pos_reference):
        domain = [
            
                '|',              
                ('assigned_config', '=', config_data['id']),             
                ('pos_reference','=', pos_reference)
        ]
        order_data = self.env['pos.order'].search_read(domain)

        
        order_line = []
        if order_data and len(order_data) > 0:
            order_ids = []
            for each_order in order_data:
                order_ids.append(each_order.get('id'))
            order_line = self.env['pos.order.line'].search_read(
                [('order_id', 'in', order_ids)])

        return {'order': order_data, 'order_line': order_line}
