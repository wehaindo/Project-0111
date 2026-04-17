# -*- coding: utf-8 -*-
from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class ProductPricelistItem(models.Model):
    _inherit = 'product.pricelist.item'

    @api.model
    def unlink(self):
        """Track deletions for POS sync"""
        # Get IDs and affected configs before deletion
        deleted_ids = self.ids
        
        # Get all POS configs that use these pricelists
        pricelist_ids = self.mapped('pricelist_id').ids
        pos_configs = self.env['pos.config'].search([
            '|',
            ('pricelist_id', 'in', pricelist_ids),
            ('available_pricelist_ids', 'in', pricelist_ids)
        ])
        config_ids = pos_configs.ids if pos_configs else None
        
        # Call parent unlink
        result = super(ProductPricelistItem, self).unlink()
        
        # Track the deletions
        if deleted_ids:
            self.env['pos.deleted.record'].sudo().track_deletion(
                'product.pricelist.item',
                deleted_ids,
                config_ids
            )
        
        return result
