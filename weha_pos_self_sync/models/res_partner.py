# -*- coding: utf-8 -*-
from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def unlink(self):
        """Track deletions for POS sync"""
        # Get IDs before deletion
        deleted_ids = self.ids
        
        # Get all POS configs
        pos_configs = self.env['pos.config'].search([])
        config_ids = pos_configs.ids if pos_configs else None
        
        # Call parent unlink
        result = super(ResPartner, self).unlink()
        
        # Track the deletions
        if deleted_ids:
            self.env['pos.deleted.record'].sudo().track_deletion(
                'res.partner',
                deleted_ids,
                config_ids
            )
        
        return result
