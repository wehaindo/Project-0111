# -*- coding: utf-8 -*-
from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.model
    def unlink(self):
        """Track deletions for POS sync"""
        # Get IDs before deletion
        deleted_ids = self.ids
        
        # Get all POS configs that might have these products
        pos_configs = self.env['pos.config'].search([])
        config_ids = pos_configs.ids if pos_configs else None
        
        # Call parent unlink
        result = super(ProductProduct, self).unlink()
        
        # Track the deletions
        if deleted_ids:
            self.env['pos.deleted.record'].sudo().track_deletion(
                'product.product',
                deleted_ids,
                config_ids
            )
        
        return result
