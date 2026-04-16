import json
import logging
import functools
import uuid
import odoo
import odoo.modules.registry
from odoo import http
from odoo.exceptions import AccessError
from odoo.http import request
from odoo.service import security
from odoo.tools import ustr
from odoo.tools.translate import _
from odoo.addons.weha_smart_pos_api.libs.common import (
    extract_arguments,
    invalid_response,
    valid_response,
)
# from .utils import ensure_db, _get_login_redirect_url, is_user_internal


_logger = logging.getLogger(__name__)

def validate_token(func):
    """."""

    @functools.wraps(func)
    def wrap(self, *args, **kwargs):
        """."""
        access_token = request.httprequest.headers.get("access_token")
        if not access_token:
            return invalid_response("access_token_not_found", "missing access token in request header", 401)
        access_token_data = (
            request.env["api.access_token"].sudo().search([("token", "=", access_token)], order="id DESC", limit=1)
        )

        if access_token_data.find_one_or_create_token(user_id=access_token_data.user_id.id) != access_token:
            return invalid_response("access_token", "token seems to have expired or invalid", 401)

        request.session.uid = access_token_data.user_id.id
        request.uid = access_token_data.user_id.id
        return func(self, *args, **kwargs)

    return wrap

class PosOrder(http.Controller):    

    def complete_order_data(self, data):   
        # Fill Data 
        data['uid']  = data['name']
        data['name'] = "Order " + data['name']
        data['amount_paid'] = False
        data['amount_tax'] = False
        data['amount_return'] = False

        data_lines = data['lines']
        lines = []
        for data_line in data_lines:    
            data_line['price_override_user'] = False
            data_line['price_override_reason'] = False        
            data_line['price_manually_set'] = True
            data_line['price_automatically_set'] = False
            tax_ids = data_line['tax_ids']
            taxes = []
            for tax_id in tax_ids:
                taxes.append([6, False,[tax_id]])
            data_line['tax_ids'] = taxes
            data_line['description'] = ""
            data_line['parent_combination_id'] = False                         
            lines.append([0,0,data_line])        
        data['lines'] = lines

        data_statement_ids = data['statement_ids']        
        statements = []
        for data_statement_id in data_statement_ids:            
            _logger.info(data_statement_id)
            if 'bca_ecr_data' not in data_statement_id.keys():
                data_statement_id['bca_ecr_data'] = ""
            if 'pan' not in data_statement_id.keys():
                data_statement_id['pan'] = ""
            if 'card_holder_name' not in data_statement_id.keys():
                data_statement_id['card_holder_name'] = ""
            if 'card_type' not in data_statement_id.keys():
                data_statement_id['card_type'] = ""
            if 'cardholder_name' not in data_statement_id.keys():
                data_statement_id['cardholder_name'] = ""
            if 'transaction_id' not in data_statement_id.keys():
                data_statement_id['transaction_id'] = ""
            if 'voucherlines' not in data_statement_id.keys():
                data_statement_id['voucherlines'] = []
            if 'approval_code' not in data_statement_id.keys():
                data_statement_id['approval_code'] = ""                   
            
            statements.append([0,0,data_statement_id])

        data['statement_ids'] = statements
        final_data = {
            'data': data
        }
        return final_data
        # [
        #     {
        #         "id": "00002-001-0001",
        #         "data": {
        #         "name": "Order 00002-001-0001",
        #         "amount_paid": 4,
        #         "amount_total": 4,
        #         "amount_tax": 0,
        #         "amount_return": 0,
        #         "lines": [
        #             [
        #             0,
        #             0,
        #             {
        #                 "qty": 2,
        #                 "price_unit": 2,
        #                 "price_subtotal": 4,
        #                 "price_subtotal_incl": 4,
        #                 "discount": 0,
        #                 "product_id": 3,
        #                 "tax_ids": [
        #                 [
        #                     6,
        #                     false,
        #                     [
        #                     1
        #                     ]
        #                 ]
        #                 ],
        #                 "id": 1,
        #                 "pack_lot_ids": []
        #             }
        #             ]
        #         ],
        #         "statement_ids": [
        #             [
        #             0,
        #             0,
        #             {
        #                 "name": "2024-09-14 12:27:30",
        #                 "payment_method_id": 2,
        #                 "amount": 4,
        #                 "payment_status": "",
        #                 "ticket": "",
        #                 "card_type": "",
        #                 "transaction_id": ""
        #             }
        #             ]
        #         ],
        #         "pos_session_id": 2,
        #         "pricelist_id": 1,
        #         "partner_id": false,
        #         "user_id": 2,
        #         "employee_id": null,
        #         "uid": "00002-001-0001",
        #         "sequence_number": 1,
        #         "creation_date": "2024-09-14T12:27:30.098Z",
        #         "fiscal_position_id": false,
        #         "server_id": false,
        #         "to_invoice": false
        #         }
        #     }
        #     ]

    @validate_token
    @http.route('/pos/decentralize/order/create', type="json", auth="none", methods=["POST"], csrf=False)
    def order_create(self, **kwargs):   
        try:
            data = request.jsonrequest
            # complete_data = self.complete_order_data(data)
            # _logger.info(complete_data)
            result = request.env['pos.order'].create_from_ui([data])
            data_return =  {
                "err": False,
                "message": '',
                "data": result      
            }
            return data_return
        except Exception as e:
            data_return =  {
                "err": False,
                "message": e,
                "data": []      
            }
            return data_return

    @validate_token
    @http.route('/pos/decentralize/order/refund', type="http", auth="none", methods=["POST"], csrf=False)
    def order_refund(self, **kwargs):        
        return {}
    
    
