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
from odoo.osv.expression import AND
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
        # request.update_env(user=request.session.uid)
        request.uid = access_token_data.user_id.id
        return func(self, *args, **kwargs)

    return wrap

class PosConfig(http.Controller):    
    
    @validate_token
    @http.route('/pos/decentralize/config/get', type="json", auth="none", methods=["POST"], csrf=False)
    def config_get(self, **kwargs):     
        data = request.jsonrequest
        domain = [('pos_config_code','=', data['pos_config_code'])]
        fields = ['id','name','currency_id','receipt_header',
                  'receipt_footer','current_session_id','pricelist_id',
                  'available_pricelist_ids','company_id','payment_method_ids']
        pos_config_id = request.env['pos.config'].sudo().search_read(domain,fields)
        if pos_config_id:
            data_return =  {
                "err": False,
                "message": '',
                "data": pos_config_id      
            }
        else:
            data_return =  {
                "err": True,
                "message": "Pos Config not found",
                "data": []
            }
        
        return valid_response(data_return)


    @validate_token
    @http.route('/pos/decentralize/config/open', type="json", auth="none", methods=["POST"], csrf=False)
    def config_open(self, **kwargs):     
        try:
            data = request.jsonrequest
            domain = [('pos_config_code','=', data['pos_config_code'])]
            pos_config_id = request.env['pos.config'].sudo().search(domain, limit=1)            
            if pos_config_id:
                domain = [
                    ('state', '=', 'opened'),
                    ('user_id', '=', request.uid),
                    ('rescue', '=', False)
                ]
          
                domain = AND([domain,[('config_id', '=', pos_config_id.id)]])

                pos_session = request.env['pos.session'].sudo().search(domain, limit=1)

                if not pos_session and pos_config_id:
                    domain = [
                        ('state', '=', 'opened'),
                        ('rescue', '=', False),
                        ('config_id', '=', pos_config_id.id),
                    ]
                    pos_session = request.env['pos.session'].sudo().search(domain, limit=1)

                if not pos_session:
                    pos_session = request.env['pos.session'].create({
                        'user_id': request.uid,
                        'config_id': pos_config_id.id
                    })

                data_return =  {
                    "err": False,
                    "message": "",
                    "data": {
                        "pos_session_id": pos_session.id
                    }                        
                }               
            else:
                data_return =  {
                    "err": True,
                    "message": "Pos Config not found",
                    "data": []
                }
        except Exception as e:
            data_return =  {
                "err": True,
                "message": str(e),
                "data": []
            }                        
        return data_return
