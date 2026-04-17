# -*- coding: utf-8 -*-

from odoo import models, fields, api
import logging

_logger = logging.getLogger(__name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'
    
    @api.model
    def get_pos_delta_products(self, last_write_date, domain=None, fields=None, limit=None, offset=0):
        """
        Get products updated since last_write_date
        Checks BOTH product variant and template write_date for price changes
        """
        if domain is None:
            domain = []
        
        if not last_write_date:
            # No date filter, just use regular search_read
            return self.search_read(
                domain=domain,
                fields=fields,
                limit=limit,
                offset=offset,
                order='write_date desc'
            )
        
        _logger.info(f'Delta sync: Searching products updated after {last_write_date}')
        _logger.info(f'Domain: {domain}')
        
        # Search for products where variant OR template was updated
        # Method 1: Variant write_date updated
        variant_domain = domain + [('write_date', '>', last_write_date)]
        variant_ids = self.search(variant_domain, order='write_date desc').ids
        _logger.info(f'Found {len(variant_ids)} products with variant write_date > {last_write_date}')
        
        # Method 2: Template write_date updated (price changes)
        template_domain = domain + [('product_tmpl_id.write_date', '>', last_write_date)]
        template_ids = self.search(template_domain, order='id desc').ids  # Can't order by related field
        _logger.info(f'Found {len(template_ids)} products with template write_date > {last_write_date}')
        
        # Combine and deduplicate IDs, maintain order
        all_ids = list(dict.fromkeys(variant_ids + template_ids))  # Preserves order, removes dupes
        _logger.info(f'Combined total: {len(all_ids)} unique products')
        
        if not all_ids:
            return []
        
        # Apply offset and limit to the combined ID list
        paginated_ids = all_ids[offset:offset + limit] if limit else all_ids[offset:]
        _logger.info(f'After pagination (offset={offset}, limit={limit}): {len(paginated_ids)} products')
        
        if not paginated_ids:
            return []
        
        # Get the actual records
        final_domain = [('id', 'in', paginated_ids)]
        products = self.search_read(
            domain=final_domain,
            fields=fields,
            order='write_date desc'
        )
        
        _logger.info(f'Returning {len(products)} products')
        return products
    
    @api.model
    def get_pos_delta_products_count(self, last_write_date, domain=None):
        """
        Get count of products updated since last_write_date
        Checks BOTH product variant and template write_date
        """
        if domain is None:
            domain = []
        
        if not last_write_date:
            return self.search_count(domain)
        
        # Count products where variant OR template was updated
        variant_domain = domain + [('write_date', '>', last_write_date)]
        variant_ids = self.search(variant_domain).ids
        
        template_domain = domain + [('product_tmpl_id.write_date', '>', last_write_date)]
        template_ids = self.search(template_domain).ids
        
        # Combine and count unique IDs
        all_ids = list(set(variant_ids + template_ids))
        
        return len(all_ids)
