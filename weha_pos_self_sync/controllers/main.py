# -*- coding: utf-8 -*-

import json
import logging
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class PosHybridSyncController(http.Controller):

    @http.route('/pos/get_updates', type='json', auth='user', methods=['POST'])
    def get_updates(self, session_id, last_write_date=None, **kwargs):
        """
        Get delta updates for products and partners
        
        Args:
            session_id: Current POS session ID
            last_write_date: ISO datetime string of last sync
            
        Returns:
            dict: {
                'products': [...],
                'partners': [...],
                'last_write_date': '...',
                'sync_timestamp': '...'
            }
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                return {
                    'error': 'Invalid session',
                    'products': [],
                    'partners': [],
                }
            
            result = session.get_delta_updates(session_id, last_write_date)
            
            _logger.info(
                f'Delta sync for session {session_id}: '
                f'{len(result["products"])} products, '
                f'{len(result["partners"])} partners'
            )
            
            return result
            
        except Exception as e:
            _logger.error(f'Error in get_updates: {str(e)}', exc_info=True)
            return {
                'error': str(e),
                'products': [],
                'partners': [],
            }

    @http.route('/pos/sync_status', type='json', auth='user', methods=['POST'])
    def sync_status(self, session_id, **kwargs):
        """
        Get sync status for current session
        
        Returns:
            dict: {
                'pending_count': int,
                'failed_count': int,
                'synced_count': int
            }
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                return {'error': 'Invalid session'}
            
            pending = request.env['pos.order'].search_count([
                ('session_id', '=', session_id),
                ('sync_status', '=', 'pending_sync')
            ])
            
            failed = request.env['pos.order'].search_count([
                ('session_id', '=', session_id),
                ('sync_status', '=', 'failed')
            ])
            
            synced = request.env['pos.order'].search_count([
                ('session_id', '=', session_id),
                ('sync_status', '=', 'synced')
            ])
            
            return {
                'pending_count': pending,
                'failed_count': failed,
                'synced_count': synced,
                'total_count': pending + failed + synced
            }
            
        except Exception as e:
            _logger.error(f'Error in sync_status: {str(e)}', exc_info=True)
            return {'error': str(e)}

    @http.route('/pos/retry_failed_orders', type='json', auth='user', methods=['POST'])
    def retry_failed_orders(self, session_id, order_uuids=None, **kwargs):
        """
        Reset failed orders to allow retry
        
        Args:
            session_id: Current POS session ID
            order_uuids: List of order UUIDs to retry (None = all failed)
            
        Returns:
            dict: {'success': bool, 'count': int}
        """
        try:
            domain = [
                ('session_id', '=', session_id),
                ('sync_status', '=', 'failed')
            ]
            
            if order_uuids:
                domain.append(('uuid', 'in', order_uuids))
            
            failed_orders = request.env['pos.order'].search(domain)
            
            failed_orders.write({
                'sync_status': 'pending_sync',
                'sync_error': False,
            })
            
            _logger.info(f'Reset {len(failed_orders)} failed orders for retry')
            
            return {
                'success': True,
                'count': len(failed_orders)
            }
            
        except Exception as e:
            _logger.error(f'Error in retry_failed_orders: {str(e)}', exc_info=True)
            return {
                'success': False,
                'error': str(e)
            }

    @http.route('/pos/get_products_by_category', type='json', auth='user', methods=['POST'])
    def get_products_by_category(self, category_id, session_id, limit=100, offset=0, **kwargs):
        """
        Lazy load products by category
        
        Args:
            category_id: POS category ID
            session_id: Current POS session ID
            limit: Max products to return
            offset: Pagination offset
            
        Returns:
            list: Product records
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            domain = [('available_in_pos', '=', True)]
            
            if category_id:
                domain.append(('pos_categ_id', '=', category_id))
            
            # Filter by config categories if limit is set
            if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
                domain.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
            
            products = request.env['product.product'].search_read(
                domain,
                fields=[
                    'id', 'name', 'display_name', 'lst_price', 'standard_price',
                    'categ_id', 'pos_categ_id', 'taxes_id', 'barcode', 'default_code',
                    'to_weight', 'uom_id', 'description_sale', 'description',
                    'product_tmpl_id', 'tracking', 'write_date', 'available_in_pos'
                ],
                limit=limit,
                offset=offset,
                order='name'
            )
            
            _logger.info(f'Loaded {len(products)} products for category {category_id}')
            
            return products
            
        except Exception as e:
            _logger.error(f'Error in get_products_by_category: {str(e)}', exc_info=True)
            return []

    @http.route('/pos/search_products', type='json', auth='user', methods=['POST'])
    def search_products(self, query, session_id, limit=50, **kwargs):
        """
        Search products by name, barcode, or reference
        
        Args:
            query: Search string
            session_id: Current POS session ID
            limit: Max results
            
        Returns:
            list: Matching products
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            domain = [
                ('available_in_pos', '=', True),
                '|', '|',
                ('name', 'ilike', query),
                ('barcode', 'ilike', query),
                ('default_code', 'ilike', query),
            ]
            
            # Filter by config categories if limit is set
            if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
                domain.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
            
            products = request.env['product.product'].search_read(
                domain,
                fields=[
                    'id', 'name', 'display_name', 'lst_price', 'standard_price',
                    'categ_id', 'pos_categ_id', 'taxes_id', 'barcode', 'default_code',
                    'to_weight', 'uom_id', 'description_sale', 'description',
                    'product_tmpl_id', 'tracking', 'write_date', 'available_in_pos'
                ],
                limit=limit,
                order='name'
            )
            
            return products
            
        except Exception as e:
            _logger.error(f'Error in search_products: {str(e)}', exc_info=True)
            return []
