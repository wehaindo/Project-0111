{
    'name': 'WEHA Smart POS - POS Data',
    'version': '13.0.1.0',
    'description': 'WEHA Smart POS - POS Data',
    'summary': 'WEHA Smart POS - POS Data',
    'author': 'WEHA',
    'website': 'https://www.weha-id.com',
    'license': 'LGPL-3',
    'category': 'Point of Sale',
    'depends': [
        'point_of_sale'
    ],
    'data': [
        "security/ir.model.access.csv",
        "views/assets.xml",
        "views/pos_config_view.xml",
        "views/product_template_view.xml",
        "views/product_pricelist_view.xml"
    ],    
    'auto_install': False,
    'application': False,
}