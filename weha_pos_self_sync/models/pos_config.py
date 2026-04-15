# -*- coding: utf-8 -*-

from odoo import models, fields, api
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_hybrid_sync = fields.Boolean(
        string='Enable Hybrid Sync',
        default=True,
        help='Enable offline-first hybrid sync for this POS'
    )
    sync_interval = fields.Integer(
        string='Sync Interval (seconds)',
        default=10,
        help='Background sync interval in seconds (5-60)'
    )
    max_sync_retries = fields.Integer(
        string='Max Sync Retries',
        default=5,
        help='Maximum number of retry attempts for failed syncs'
    )
    lazy_load_products = fields.Boolean(
        string='Lazy Load Products',
        default=True,
        help='Load products on-demand instead of all at startup'
    )
    initial_product_limit = fields.Integer(
        string='Initial Product Load',
        default=100,
        help='Number of products to load initially'
    )
    enable_auto_save = fields.Boolean(
        string='Auto-save Orders',
        default=True,
        help='Automatically save orders to IndexedDB'
    )
    enable_delta_sync = fields.Boolean(
        string='Enable Delta Sync',
        default=True,
        help='Only sync changed data instead of full reload'
    )
    
    @api.constrains('sync_interval')
    def _check_sync_interval(self):
        for record in self:
            if record.sync_interval < 5 or record.sync_interval > 60:
                raise ValidationError('Sync interval must be between 5 and 60 seconds')
    
    @api.constrains('max_sync_retries')
    def _check_max_retries(self):
        for record in self:
            if record.max_sync_retries < 1 or record.max_sync_retries > 10:
                raise ValidationError('Max retries must be between 1 and 10')
