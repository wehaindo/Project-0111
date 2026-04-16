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
        # request.update_env(user=request.session.uid)
        request.uid = access_token_data.user_id.id
        return func(self, *args, **kwargs)

    return wrap 

class PosSession(http.Controller):    
    
    # @validate_token
    # @http.route('/pos/decentralize/session/load_pos_data', type="http", auth="none", methods=["POST"], csrf=False)
    # def session_load_pos_data(self, **kwargs):        
    #     try:
    #         data = json.loads(request.httprequest.data)
    #         if 'pos_session_id' in data:
    #             pos_session_id = request.env['pos.session'].browse(data['pos_session_id'])
    #             loaded_data = pos_session_id.load_pos_data()
    #         data_return =  {
    #             "err": False,
    #             "message": 'Session close succesffully',
    #             "data": loaded_data     
    #         }
    #         return valid_response(data_return)
    #     except Exception as e:
    #         data_return =  {
    #             "err": True,
    #             "message": str(e),
    #             "data": []      
    #         }
    #         return valid_response(data_return)

    @validate_token
    @http.route('/pos/decentralize/session/get', type="http", auth="none", methods=["POST"], csrf=False)
    def session_get(self, **kwargs):     
        data = json.loads(request.httprequest.data)
        if 'pos_session_id' in data:
            _logger.info(data['pos_session_id'])
            pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
            _logger.info(pos_session_id)
            data_return = {
                "err": False,
                "message": "",
                "data": {
                    "id": pos_session_id.id,                                    
                    "company_id": [pos_session_id.company_id.id,pos_session_id.company_id.name],
                    "config_id": [pos_session_id.config_id.id,pos_session_id.config_id.name],
                    "name": pos_session_id.name,
                    "user_id": [pos_session_id.user_id.id,pos_session_id.user_id.name],
                    "currency_id": [pos_session_id.currency_id.id,pos_session_id.currency_id.name],
                    "start_at": pos_session_id.start_at,
                    "stop_at": pos_session_id.stop_at,
                    "state": pos_session_id.state,
                    "sequence_number": pos_session_id.sequence_number,
                    "cash_control": pos_session_id.cash_control                
                }
            }
            return valid_response(data_return)
        else:
            data_return =  {
                "err": True,
                "message": "Data not valid",
                "data": []      
            }
            return valid_response(data_return)

    @validate_token
    @http.route('/pos/decentralize/session/closing', type="http", auth="none", methods=["POST"], csrf=False)
    def session_get_closing_control_data(self, **kwargs):
        try:
            data = json.loads(request.httprequest.data)
            if 'pos_session_id' in data:
                pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
                closing_data = pos_session_id.get_closing_control_data()
                data_return = {
                    "err": False,
                    "message": "",
                    "data": closing_data   
                }
                return valid_response(data_return)
            else:
                data_return =  {
                    "err": True,
                    "message": "Data not valid",
                    "data": []      
                }
                return valid_response(data_return)
        except Exception as e:
            data_return =  {
                "err": True,
                "message": e,
                "data": []      
            }
            return valid_response(data_return)

    @validate_token
    @http.route('/pos/decentralize/session/set_cashbox_pos', type="http", auth="none", methods=["POST"], csrf=False)
    def session_set_cashbox_pos(self, **kwargs):     
        try:
            data = json.loads(request.httprequest.data)
            if 'pos_session_id' in data and 'cashbox_value' in data:
                pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
                pos_session_id.set_cashbox_pos(data['cashbox_value'], "")
                data_return =  {
                    "err": False,
                    "message": "Successfull",
                    "data": []      
                }
            else:
                data_return =  {
                    "err": True,
                    "message": "Data not valid",
                    "data": []      
                }
            return valid_response(data_return)
        except Exception as e:
            data_return =  {
                "err": True,
                "message": e,
                "data": []      
            }
            return valid_response(data_return)

    @validate_token
    @http.route('/pos/decentralize/session/close', type="json", auth="none", methods=["POST"], csrf=False)
    def session_close(self, **kwargs):
        try:
            data = request.jsonrequest
            if 'pos_session_id' in data:
                pos_session_id = request.env['pos.session'].sudo().browse(data['pos_session_id'])
                if pos_session_id.state == 'closed':
                    data_return =  {
                        "err": False,
                        "message": "Session was closed",
                        "data": []      
                    }
                    return data_return

                pos_session_id.action_pos_session_closing_control()                
                data_return =  {
                    "err": False,
                    "message": "Session close successfully",
                    "data": []      
                }
                return data_return
            else:
                data_return =  {
                    "err": True,
                    "message": "Data not valid",
                    "data": []      
                }
                return data_return

        except Exception as e:
            data_return =  {
                "err": True,
                "message": e,
                "data": []      
            }
            return data_return