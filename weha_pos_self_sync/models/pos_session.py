# -*- coding: utf-8 -*-

from odoo import models, fields, api
import logging

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    last_sync_timestamp = fields.Datetime(
        string='Last Sync Timestamp',
        help='Timestamp of last successful delta sync'
    )
    pending_sync_count = fields.Integer(
        string='Pending Sync Count',
        compute='_compute_pending_sync_count',
        help='Number of orders pending sync'
    )

    def _compute_pending_sync_count(self):
        for session in self:
            count = self.env['pos.order'].search_count([
                ('session_id', '=', session.id),
                ('sync_status', 'in', ['pending_sync', 'failed'])
            ])
            session.pending_sync_count = count

    @api.model
    def get_delta_updates(self, session_id, last_write_date=None):
        """
        Get updated products and partners since last sync
        """
        session = self.browse(session_id)
        
        domain_products = []
        domain_partners = []
        
        if last_write_date:
            domain_products = [('write_date', '>', last_write_date)]
            domain_partners = [('write_date', '>', last_write_date)]
        
        # Filter by available in POS and config categories
        domain_products.append(('available_in_pos', '=', True))
        
        if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
            domain_products.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
        
        # Fetch updated products using custom method that checks template write_date
        products = self.env['product.product'].get_pos_delta_products(
            last_write_date=last_write_date,
            domain=domain_products,
            fields=[
                'id', 'name', 'display_name', 'lst_price', 'standard_price',
                'categ_id', 'pos_categ_id', 'taxes_id', 'barcode', 'default_code',
                'to_weight', 'uom_id', 'description_sale', 'description',
                'product_tmpl_id', 'tracking', 'write_date', 'available_in_pos'
            ]
        )
        
        # Fetch updated partners
        partners = self.env['res.partner'].search_read(
            domain_partners,
            fields=[
                'id', 'name', 'street', 'city', 'state_id', 'country_id',
                'vat', 'phone', 'zip', 'mobile', 'email', 'barcode',
                'write_date', 'property_account_position_id',
                'property_product_pricelist'
            ],
            limit=1000
        )
        
        return {
            'products': products,
            'partners': partners,
            'last_write_date': fields.Datetime.now().isoformat(),
            'sync_timestamp': fields.Datetime.now().isoformat()
        }
