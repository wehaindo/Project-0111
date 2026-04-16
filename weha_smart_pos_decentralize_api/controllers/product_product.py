import json
import logging
import functools

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
import werkzeug
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
        request.update_env(user=request.session.uid)
        # request.uid = access_token_data.user_id.id
        return func(self, *args, **kwargs)

    return wrap 

class ProductProduct(http.Controller):    
    
    @validate_token
    @http.route('/pos/decentralize/product_product/load_pos_data', type="http", auth="none", methods=["POST"], csrf=False)
    def load_pos_data(self, **kwargs):        
        try:
            data = json.loads(request.httprequest.data)
            if 'pos_session_id' in data:
                pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
                loaded_data = pos_session_id._load_model('product.product')
            data_return =  {
                "err": False,
                "message": 'Session close succesffully',
                "data": loaded_data     
            }
            return valid_response(data_return)
        except Exception as e:
            data_return =  {
                "err": True,
                "message": str(e),
                "data": []      
            }
            return valid_response(data_return)

    @validate_token
    @http.route('/pos/decentralize/product_product/sync', type="http", auth="none", methods=["POST"], csrf=False)
    def load_pos_data(self, **kwargs):        
        try:
            data = json.loads(request.httprequest.data)
            if 'pos_session_id' in data:
                pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
                loaded_data = pos_session_id._load_model('product.product')
            data_return =  {
                "err": False,
                "message": 'Session close succesffully',
                "data": loaded_data     
            }
            return valid_response(data_return)
        except Exception as e:
            data_return =  {
                "err": True,
                "message": str(e),
                "data": []      
            }
            return valid_response(data_return)


    @validate_token
    @http.route('/pos/decentralize/product_product/push', type="json", auth="none", methods=["POST"], csrf=False)
    def load_pos_data(self, **kwargs):        
        try:
            data = request.jsonrequest
            if 'last_sync_datetime' in data:
                domain = [
                    ('write_date','>=',  data['last_sync_datetime'])
                ]
                product_ids = request.env['product.product'].sudo().search(domain)  
                              
            data_return =  {
                "err": False,
                "message": 'Session close succesffully',
                "data": loaded_data     
            }
            return valid_response(data_return)
        except Exception as e:
            data_return =  {
                "err": True,
                "message": str(e),
                "data": []      
            }
            return valid_response(data_return)