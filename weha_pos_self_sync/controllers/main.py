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
                'pricelist_item_count': int,
                'sync_timestamp': str
            }
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                return {'error': 'Invalid session', 'product_count': 0, 'partner_count': 0, 'pricelist_item_count': 0}
            
            domain_products = [('available_in_pos', '=', True)]
            domain_partners = []
            domain_pricelist_items = []
            
            if last_write_date:
                domain_partners.append(('write_date', '>', last_write_date))
                domain_pricelist_items.append(('write_date', '>', last_write_date))
            
            if session.config_id.limit_categories and session.config_id.iface_available_categ_ids:
                domain_products.append(('pos_categ_id', 'in', session.config_id.iface_available_categ_ids.ids))
            
            # Get pricelist IDs from config
            pricelist_ids = []
            
            # Check if multiple pricelists are enabled
            if hasattr(session.config_id, 'use_pricelist') and session.config_id.use_pricelist:
                if hasattr(session.config_id, 'available_pricelist_ids') and session.config_id.available_pricelist_ids:
                    # Multiple pricelists configured
                    pricelist_ids = session.config_id.available_pricelist_ids.ids
                    _logger.info(f'Using multiple pricelists from config: {pricelist_ids}')
                elif hasattr(session.config_id, 'pricelist_id') and session.config_id.pricelist_id:
                    # Single pricelist configured
                    pricelist_ids = [session.config_id.pricelist_id.id]
                    _logger.info(f'Using single pricelist from config: {pricelist_ids}')
            else:
                _logger.warning('Pricelists not enabled in POS config')
            
            if pricelist_ids:
                domain_pricelist_items.append(('pricelist_id', 'in', pricelist_ids))
                _logger.info(f'Filtering pricelist items by pricelists: {pricelist_ids}')
            else:
                _logger.warning('No pricelists configured - skipping pricelist item sync')
            
            # Use custom method that checks both variant and template
            product_count = request.env['product.product'].get_pos_delta_products_count(
                last_write_date=last_write_date,
                domain=domain_products
            )
            partner_count = request.env['res.partner'].search_count(domain_partners)
            
            if pricelist_ids:
                pricelist_item_count = request.env['product.pricelist.item'].search_count(domain_pricelist_items)
            else:
                pricelist_item_count = 0
            
            _logger.info(f'Pricelist items domain: {domain_pricelist_items}')
            _logger.info(f'Pricelist item count: {pricelist_item_count}')
            
            from odoo import fields
            sync_timestamp = fields.Datetime.now().isoformat()
            
            _logger.info(f'Delta count for session {session_id}: {product_count} products, {partner_count} partners, {pricelist_item_count} pricelist items')
            
            return {
                'product_count': product_count,
                'partner_count': partner_count,
                'pricelist_item_count': pricelist_item_count,
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

    @http.route('/pos/get_updates_pricelist_items', type='json', auth='user', methods=['POST'])
    def get_updates_pricelist_items(self, session_id, last_write_date=None, limit=500, offset=0, **kwargs):
        """
        Get updated pricelist items in batches
        
        Args:
            session_id: POS session ID
            last_write_date: Last sync timestamp
            limit: Batch size (default 500)
            offset: Offset for pagination
            
        Returns:
            list: Pricelist item records
        """
        try:
            _logger.info(f'=== get_updates_pricelist_items called ===')
            _logger.info(f'Session ID: {session_id}, Last write_date: {last_write_date}')
            
            session = request.env['pos.session'].browse(session_id)
            
            if not session.exists():
                _logger.warning('Session does not exist!')
                return []
            
            domain = []
            
            if last_write_date:
                domain.append(('write_date', '>', last_write_date))
            
            # Get pricelist IDs from config
            pricelist_ids = []
            
            # Check if multiple pricelists are enabled
            if hasattr(session.config_id, 'use_pricelist') and session.config_id.use_pricelist:
                if hasattr(session.config_id, 'available_pricelist_ids') and session.config_id.available_pricelist_ids:
                    # Multiple pricelists configured
                    pricelist_ids = session.config_id.available_pricelist_ids.ids
                    _logger.info(f'Using multiple pricelists: {pricelist_ids}')
                elif hasattr(session.config_id, 'pricelist_id') and session.config_id.pricelist_id:
                    # Single pricelist configured
                    pricelist_ids = [session.config_id.pricelist_id.id]
                    _logger.info(f'Using single pricelist: {pricelist_ids}')
            
            if not pricelist_ids:
                _logger.warning('No pricelists configured in POS config')
                return []
            
            # Filter by pricelists from POS config
            domain.append(('pricelist_id', 'in', pricelist_ids))
            _logger.info(f'Filtering pricelist items by pricelists: {pricelist_ids}')
            
            pricelist_item_fields = [
                'id', 'pricelist_id', 'product_tmpl_id', 'product_id',
                'categ_id', 'min_quantity', 'applied_on', 'base',
                'base_pricelist_id', 'compute_price', 'fixed_price',
                'percent_price', 'price_discount', 'price_surcharge',
                'price_round', 'price_min_margin', 'price_max_margin',
                'company_id', 'currency_id', 'date_start', 'date_end',
                'write_date'
            ]
            
            pricelist_items = request.env['product.pricelist.item'].search_read(
                domain,
                fields=pricelist_item_fields,
                limit=limit,
                offset=offset,
                order='write_date desc'
            )
            
            _logger.info(f'Fetched batch {offset}-{offset+len(pricelist_items)}, returned {len(pricelist_items)} pricelist items')
            
            if len(pricelist_items) > 0:
                _logger.info(f'First pricelist item: ID={pricelist_items[0].get("id")}, pricelist={pricelist_items[0].get("pricelist_id")}')
            
            return pricelist_items
            
        except Exception as e:
            _logger.error(f'Error in get_updates_pricelist_items: {str(e)}', exc_info=True)
            return []

    @http.route('/pos/get_deleted_pricelist_items', type='json', auth='user', methods=['POST'])
    def get_deleted_pricelist_items(self, session_id, since_timestamp, **kwargs):
        """
        Get pricelist items deleted since a timestamp
        Much more efficient than comparing all IDs
        
        Args:
            session_id: Current POS session ID
            since_timestamp: ISO format datetime string
            
        Returns:
            list: Deleted pricelist item IDs
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            config = session.config_id
            
            # Get deleted item IDs from tracking table
            deleted_ids = request.env['pos.deleted.record'].get_deletions_since(
                'product.pricelist.item',
                since_timestamp,
                config.id
            )
            
            _logger.info(f'Found {len(deleted_ids)} deleted pricelist items since {since_timestamp}')
            
            return deleted_ids
            
        except Exception as e:
            _logger.error(f'Error in get_deleted_pricelist_items: {str(e)}', exc_info=True)
            return []

    @http.route('/pos/get_deleted_products', type='json', auth='user', methods=['POST'])
    def get_deleted_products(self, session_id, since_timestamp, **kwargs):
        """
        Get products deleted since a timestamp
        
        Args:
            session_id: Current POS session ID
            since_timestamp: ISO format datetime string
            
        Returns:
            list: Deleted product IDs
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            config = session.config_id
            
            # Get deleted product IDs from tracking table
            deleted_ids = request.env['pos.deleted.record'].get_deletions_since(
                'product.product',
                since_timestamp,
                config.id
            )
            
            _logger.info(f'Found {len(deleted_ids)} deleted products since {since_timestamp}')
            
            return deleted_ids
            
        except Exception as e:
            _logger.error(f'Error in get_deleted_products: {str(e)}', exc_info=True)
            return []

    @http.route('/pos/get_deleted_partners', type='json', auth='user', methods=['POST'])
    def get_deleted_partners(self, session_id, since_timestamp, **kwargs):
        """
        Get partners deleted since a timestamp
        
        Args:
            session_id: Current POS session ID
            since_timestamp: ISO format datetime string
            
        Returns:
            list: Deleted partner IDs
        """
        try:
            session = request.env['pos.session'].browse(session_id)
            config = session.config_id
            
            # Get deleted partner IDs from tracking table
            deleted_ids = request.env['pos.deleted.record'].get_deletions_since(
                'res.partner',
                since_timestamp,
                config.id
            )
            
            _logger.info(f'Found {len(deleted_ids)} deleted partners since {since_timestamp}')
            
            return deleted_ids
            
        except Exception as e:
            _logger.error(f'Error in get_deleted_partners: {str(e)}', exc_info=True)
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
