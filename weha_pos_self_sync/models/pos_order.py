# -*- coding: utf-8 -*-

from odoo import models, fields, api
from odoo.exceptions import ValidationError
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    uuid = fields.Char(
        string='UUID',
        copy=False,
        index=True,
        help='Unique identifier to prevent duplicate order submission'
    )
    sync_status = fields.Selection([
        ('draft', 'Draft'),
        ('pending_sync', 'Pending Sync'),
        ('syncing', 'Syncing'),
        ('synced', 'Synced'),
        ('failed', 'Failed')
    ], string='Sync Status', default='draft', index=True)
    sync_attempts = fields.Integer(string='Sync Attempts', default=0)
    last_sync_attempt = fields.Datetime(string='Last Sync Attempt')
    sync_error = fields.Text(string='Sync Error Message')

    _sql_constraints = [
        ('uuid_unique', 'unique(uuid)', 'Order UUID must be unique!')
    ]

    @api.model
    def create_from_ui(self, orders, draft=False):
        """
        Override to handle UUID and prevent duplicates
        """
        order_ids = []
        
        for order in orders:
            data = order.get('data', {})
            uuid = data.get('uuid')
            
            # Check for duplicate UUID
            if uuid:
                existing_order = self.search([('uuid', '=', uuid)], limit=1)
                if existing_order:
                    _logger.warning(f'Duplicate order UUID detected: {uuid}. Skipping order.')
                    order_ids.append(existing_order.id)
                    continue
            
            # Add UUID to data if not present
            if not uuid:
                import uuid as uuid_lib
                data['uuid'] = str(uuid_lib.uuid4())
            
            # Set sync status
            data['sync_status'] = 'synced'
        
        # Call parent method
        result = super(PosOrder, self).create_from_ui(orders, draft=draft)
        
        return result

    @api.model
    def search_read(self, domain=None, fields=None, offset=0, limit=None, order=None):
        """
        Override to add write_date to fields for delta sync
        """
        if fields and 'write_date' not in fields:
            fields.append('write_date')
        
        return super(PosOrder, self).search_read(
            domain=domain,
            fields=fields,
            offset=offset,
            limit=limit,
            order=order
        )
