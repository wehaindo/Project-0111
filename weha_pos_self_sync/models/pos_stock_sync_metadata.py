# -*- coding: utf-8 -*-

from odoo import models, fields, api


class PosStockSyncMetadata(models.Model):
    _name = 'pos.stock.sync.metadata'
    _description = 'POS Stock Synchronization Metadata'
    _order = 'write_date desc'

    pos_config_id = fields.Many2one(
        'pos.config',
        string='POS Configuration',
        required=True,
        ondelete='cascade',
        index=True
    )
    location_id = fields.Many2one(
        'stock.location',
        string='Stock Location',
        required=True,
        index=True
    )
    last_sync_date = fields.Datetime(
        string='Last Sync Date',
        default=fields.Datetime.now
    )
    total_products_synced = fields.Integer(
        string='Total Products Synced',
        default=0
    )
    last_product_count = fields.Integer(
        string='Last Product Count',
        default=0
    )
    sync_status = fields.Selection([
        ('idle', 'Idle'),
        ('syncing', 'Syncing'),
        ('completed', 'Completed'),
        ('failed', 'Failed')
    ], string='Sync Status', default='idle')
    
    error_message = fields.Text(
        string='Error Message'
    )

    @api.model
    def update_sync_metadata(self, pos_config_id, location_id, products_synced):
        """
        Update or create sync metadata for a POS config and location
        """
        metadata = self.search([
            ('pos_config_id', '=', pos_config_id),
            ('location_id', '=', location_id)
        ], limit=1)
        
        if metadata:
            metadata.write({
                'last_sync_date': fields.Datetime.now(),
                'total_products_synced': products_synced,
                'sync_status': 'completed',
                'error_message': False
            })
        else:
            metadata = self.create({
                'pos_config_id': pos_config_id,
                'location_id': location_id,
                'last_sync_date': fields.Datetime.now(),
                'total_products_synced': products_synced,
                'sync_status': 'completed'
            })
        
        return metadata.id

    @api.model
    def mark_sync_failed(self, pos_config_id, location_id, error_msg):
        """
        Mark sync as failed with error message
        """
        metadata = self.search([
            ('pos_config_id', '=', pos_config_id),
            ('location_id', '=', location_id)
        ], limit=1)
        
        if metadata:
            metadata.write({
                'sync_status': 'failed',
                'error_message': error_msg
            })
        else:
            self.create({
                'pos_config_id': pos_config_id,
                'location_id': location_id,
                'sync_status': 'failed',
                'error_message': error_msg
            })
