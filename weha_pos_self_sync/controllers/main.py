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

    @http.route('/pos/get_updates_count', type='json', auth='user', methods=['POST'])
    def get_updates_count(self, session_id, last_write_date=None, **kwargs):
        """
        Get count of updates available (fast, non-blocking)
        
        Returns:
            dict: {
                'product_count': int,
                'partner_count': int,
                'sync_timestamp': str
            }
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                return {'error': 'Invalid session', 'product_count': 0, 'partner_count': 0}
            
            domain_products = [('available_in_pos', '=', True)]
            domain_partners = []
            
            if last_write_date:
                domain_partners.append(('write_date', '>', last_write_date))
            
            if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
                domain_products.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
            
            # Use custom method that checks both variant and template
            product_count = request.env['product.product'].get_pos_delta_products_count(
                last_write_date=last_write_date,
                domain=domain_products
            )
            partner_count = request.env['res.partner'].search_count(domain_partners)
            
            from odoo import fields
            sync_timestamp = fields.Datetime.now().isoformat()
            
            _logger.info(f'Delta count for session {session_id}: {product_count} products, {partner_count} partners')
            
            return {
                'product_count': product_count,
                'partner_count': partner_count,
                'sync_timestamp': sync_timestamp
            }
            
        except Exception as e:
            _logger.error(f'Error in get_updates_count: {str(e)}', exc_info=True)
            return {'error': str(e), 'product_count': 0, 'partner_count': 0}

    @http.route('/pos/get_updates_products', type='json', auth='user', methods=['POST'])
    def get_updates_products(self, session_id, last_write_date=None, limit=500, offset=0, **kwargs):
        """
        Get updated products in batches
        
        Args:
            session_id: POS session ID
            last_write_date: Last sync timestamp
            limit: Batch size (default 500)
            offset: Offset for pagination
            
        Returns:
            list: Product records
        """
        try:
            _logger.info(f'=== get_updates_products called ===')
            _logger.info(f'Session ID: {session_id}')
            _logger.info(f'Last write_date: {last_write_date}')
            _logger.info(f'Limit: {limit}, Offset: {offset}')
            
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                _logger.warning('Session does not exist!')
                return []
            
            domain = [('available_in_pos', '=', True)]
            
            if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
                domain.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
            
            _logger.info(f'Base domain: {domain}')
            
            product_fields = [
                'id', 'name', 'display_name', 'lst_price', 'standard_price',
                'categ_id', 'pos_categ_id', 'taxes_id', 'barcode', 'default_code',
                'to_weight', 'uom_id', 'description_sale', 'description',
                'product_tmpl_id', 'tracking', 'write_date', 'available_in_pos'
            ]
            
            # Use custom method that checks both variant and template write_date
            products = request.env['product.product'].get_pos_delta_products(
                last_write_date=last_write_date,
                domain=domain,
                fields=product_fields,
                limit=limit,
                offset=offset
            )
            
            _logger.info(f'Fetched batch {offset}-{offset+len(products)}, returned {len(products)} products for session {session_id}')
            
            if len(products) > 0:
                _logger.info(f'First product: ID={products[0].get("id")}, name={products[0].get("name")}, price={products[0].get("lst_price")}')
            
            return products
            
        except Exception as e:
            _logger.error(f'Error in get_updates_products: {str(e)}', exc_info=True)
            return []

    @http.route('/pos/get_updates_partners', type='json', auth='user', methods=['POST'])
    def get_updates_partners(self, session_id, last_write_date=None, **kwargs):
        """
        Get updated partners
        
        Returns:
            list: Partner records
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                return []
            
            domain = []
            if last_write_date:
                domain.append(('write_date', '>', last_write_date))
            
            partner_fields = [
                'id', 'name', 'street', 'city', 'state_id', 'country_id',
                'vat', 'phone', 'zip', 'mobile', 'email', 'barcode',
                'write_date', 'property_account_position_id',
                'property_product_pricelist'
            ]
            
            partners = request.env['res.partner'].search_read(
                domain,
                fields=partner_fields,
                limit=1000
            )
            
            _logger.info(f'Fetched {len(partners)} partners for session {session_id}')
            
            return partners
            
        except Exception as e:
            _logger.error(f'Error in get_updates_partners: {str(e)}', exc_info=True)
            return []


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
