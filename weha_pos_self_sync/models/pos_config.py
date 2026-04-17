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
    sync_method = fields.Selection([
        ('normal', 'Normal POS'),
        ('lazy', 'Lazy Load'),
        ('hybrid', 'Hybrid'),
    ],
        string='Sync Method',
        default='lazy',
        help='Normal: Load all products at startup (standard Odoo)\n'
             'Lazy: Load products only when searched/scanned (best for 10k+ products)\n'
             'Hybrid: Load initial batch + on-demand'
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
        help='Deprecated: Use Sync Method instead',
        compute='_compute_lazy_load',
        store=False
    )
    initial_product_limit = fields.Integer(
        string='Initial Product Load',
        default=100,
        help='Number of products to load initially (only for Hybrid mode)'
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
    
    # Stock Synchronization Settings
    enable_stock_sync = fields.Boolean(
        string='Enable Stock Sync',
        default=True,
        help='Enable real-time stock quantity synchronization'
    )
    show_stock_quantity = fields.Boolean(
        string='Show Stock Quantity',
        default=True,
        help='Display stock quantities on product cards in POS'
    )
    stock_sync_interval = fields.Integer(
        string='Stock Sync Interval (minutes)',
        default=5,
        help='How often to sync stock quantities (1-60 minutes)'
    )
    low_stock_threshold = fields.Integer(
        string='Low Stock Threshold',
        default=10,
        help='Show warning when stock falls below this number'
    )
    prevent_negative_stock = fields.Boolean(
        string='Prevent Negative Stock',
        default=False,
        help='Block adding products to cart if stock is insufficient'
    )
    stock_location_id = fields.Many2one(
        'stock.location',
        string='Stock Location',
        help='Location to track stock from (uses POS picking type location if not set)',
        domain=[('usage', '=', 'internal')]
    )
    
    @api.depends('sync_method')
    def _compute_lazy_load(self):
        """Backward compatibility for lazy_load_products field"""
        for record in self:
            record.lazy_load_products = record.sync_method in ('lazy', 'hybrid')
    
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
    
    @api.constrains('stock_sync_interval')
    def _check_stock_sync_interval(self):
        for record in self:
            if record.enable_stock_sync and (record.stock_sync_interval < 1 or record.stock_sync_interval > 60):
                raise ValidationError('Stock sync interval must be between 1 and 60 minutes')
