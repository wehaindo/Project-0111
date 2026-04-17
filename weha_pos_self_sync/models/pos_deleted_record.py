# -*- coding: utf-8 -*-
from odoo import models, fields, api
from datetime import timedelta
import logging

_logger = logging.getLogger(__name__)


class PosDeletedRecord(models.Model):
    _name = 'pos.deleted.record'
    _description = 'Track deleted records for POS sync'
    _order = 'deletion_date desc'

    model_name = fields.Char('Model Name', required=True, index=True)
    record_id = fields.Integer('Record ID', required=True, index=True)
    deletion_date = fields.Datetime('Deletion Date', default=fields.Datetime.now, required=True, index=True)
    config_ids = fields.Many2many('pos.config', string='POS Configs', 
                                   help='Leave empty for all configs')
    
    _sql_constraints = [
        ('unique_deletion', 'unique(model_name, record_id)', 
         'This record deletion is already tracked!')
    ]

    @api.model
    def track_deletion(self, model_name, record_ids, config_ids=None):
        """
        Track deleted records for POS sync
        
        Args:
            model_name: Name of the model (e.g., 'product.pricelist.item')
            record_ids: List of deleted record IDs
            config_ids: List of POS config IDs (None = all configs)
        """
        if not isinstance(record_ids, list):
            record_ids = [record_ids]
        
        for record_id in record_ids:
            try:
                vals = {
                    'model_name': model_name,
                    'record_id': record_id,
                    'deletion_date': fields.Datetime.now(),
                }
                
                # Check if already tracked
                existing = self.search([
                    ('model_name', '=', model_name),
                    ('record_id', '=', record_id)
                ])
                
                if not existing:
                    deletion = self.create(vals)
                    if config_ids:
                        deletion.config_ids = [(6, 0, config_ids)]
                    _logger.info(f'Tracked deletion: {model_name} ID {record_id}')
                    
            except Exception as e:
                _logger.error(f'Error tracking deletion {model_name} ID {record_id}: {str(e)}')

    @api.model
    def get_deletions_since(self, model_name, since_date, config_id=None):
        """
        Get deleted record IDs since a specific date
        
        Args:
            model_name: Model to check
            since_date: Get deletions after this date
            config_id: POS config ID (optional)
            
        Returns:
            list: Deleted record IDs
        """
        domain = [
            ('model_name', '=', model_name),
            ('deletion_date', '>', since_date)
        ]
        
        # Filter by config if specified
        if config_id:
            domain.append('|')
            domain.append(('config_ids', '=', False))  # No specific configs = all configs
            domain.append(('config_ids', 'in', [config_id]))
        
        deletions = self.search(domain)
        return deletions.mapped('record_id')

    @api.model
    def cleanup_old_deletions(self, days=30):
        """
        Remove deletion records older than specified days
        Should be called by scheduled action
        """
        cutoff_date = fields.Datetime.now() - timedelta(days=days)
        old_deletions = self.search([('deletion_date', '<', cutoff_date)])
        count = len(old_deletions)
        old_deletions.unlink()
        _logger.info(f'Cleaned up {count} old deletion records')
        return count
