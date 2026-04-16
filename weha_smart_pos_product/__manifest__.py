{
    'name': 'WEHA Smart POS - POS Products',
    'version': '13.0.1.0',
    'description': 'WEHA Smart POS - POS Products',
    'summary': 'WEHA Smart POS - POS Products',
    'author': 'WEHA',
    'website': 'https://www.weha-id.com',
    'license': 'LGPL-3',
    'category': 'Point of Sale',
    'depends': [
        'point_of_sale',
        'weha_smart_pos_online',        
    ],
    'data': [
        "views/assets.xml",
    ],    
    'qweb': [
        'static/src/xml/*.xml',
    ],
    'auto_install': False,
    'application': False,
}