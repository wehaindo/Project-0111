{
    'name': 'WEHA Smart POS - POS Online',
    'version': '13.0.1.0',
    'description': 'WEHA Smart POS - POS Online',
    'summary': 'WEHA Smart POS - POS Online',
    'author': 'WEHA',
    'website': 'https://www.weha-id.com',
    'license': 'LGPL-3',
    'category': 'Point of Sale',
    'depends': [
        'point_of_sale',        
        'dmi_pos_modifier',
        # 'sh_pos_order_list',
        'sh_pos_order_return_exchange',
        # 'sh_pos_order_return_exchange_barcode',
        'pos_hr',
        'pos_mobile_ui',
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