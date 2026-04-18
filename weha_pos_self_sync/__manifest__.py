# -*- coding: utf-8 -*-
{
    'name': 'POS Hybrid Sync - Offline First',
    'version': '13.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Enhanced POS with offline-first capability, background sync, and performance optimization',
    'description': """
POS Hybrid Sync Enhancement
============================

Features:
---------
* Offline-first POS capability
* Reliable background synchronization
* Full data sync (products, partners, orders)
* Retry mechanism with queue system
* Performance optimization with lazy loading
* Delta sync using write_date
* IndexedDB for persistent storage
* No middleware required - direct Odoo RPC

Technical:
----------
* Local sync queue with retry logic
* Background sync worker
* Auto-save orders for offline safety
* Duplicate prevention with UUID
* Exponential backoff for failed syncs
""",
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'web',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/assets.xml',
        'views/pos_config_views.xml',
        'views/pos_deleted_record_views.xml',
        'views/pos_stock_sync_views.xml',
    ],
    'qweb': [
        'static/src/xml/pos_templates.xml',
        'static/src/xml/screen_product_list.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}
