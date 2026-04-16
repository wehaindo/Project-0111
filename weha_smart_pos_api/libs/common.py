import logging
import datetime
import json
import ast
import requests
import werkzeug.wrappers
from odoo.tools.misc import DEFAULT_SERVER_DATETIME_FORMAT, DEFAULT_SERVER_DATE_FORMAT
from odoo.tools import DEFAULT_SERVER_DATE_FORMAT
from datetime import datetime, timedelta, date
import pytz 

_logger = logging.getLogger(__name__)


def default(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    if isinstance(o, bytes):
        return str(o)


def valid_response(data, status=200):
    """Valid Response
    This will be return when the http request was successfully processed."""
    #data = {"count": len(data) if not isinstance(data, str) else 1, "data": data}
    return werkzeug.wrappers.Response(
        status=status, 
        content_type="application/json; charset=utf-8", 
        response=json.dumps(data, default=default),
    )


def invalid_response(typ, message=None, status=401):
    """Invalid Response
    This will be the return value whenever the server runs into an error
    either from the client or the server."""
    # return json.dumps({})
    return werkzeug.wrappers.Response(
        status=status,
        content_type="application/json; charset=utf-8",
        response=json.dumps(
            {"type": typ, "message": str(message) if str(message) else "wrong arguments (missing validation)",},
            default=datetime.isoformat,
        ),
    )

def extract_arguments(payloads, offset=0, limit=0, order=None):
    """Parse additional data  sent along request."""
    payloads = payloads.get("payload", {})
    fields, domain, payload = [], [], {}

    if payloads.get("domain", None):
        domain = ast.literal_eval(payloads.get("domain"))
    if payloads.get("fields"):
        fields = ast.literal_eval(payloads.get("fields"))
    if payloads.get("offset"):
        offset = int(payloads.get("offset"))
    if payloads.get("limit"):
        limit = int(payloads.get("limit"))
    if payloads.get("order"):
        order = payloads.get("order")
    filters = [domain, fields, offset, limit, order]

    return filters

def convert_local_to_utc(user_tz, trans_date):
    _logger.info(user_tz)
    local = pytz.timezone(user_tz)
    _logger.info(trans_date)
    trans_date = local.localize(datetime.strptime(trans_date,DEFAULT_SERVER_DATETIME_FORMAT)).astimezone(pytz.utc)
    trans_date = datetime.strftime(trans_date,"%Y-%m-%d %H:%M:%S") 
    _logger.info(trans_date)
    return trans_date

def convert_utc_to_local(user_tz, trans_date):
    _logger.info(user_tz)
    local = pytz.timezone(user_tz)
    _logger.info(trans_date)
    trans_date = pytz.utc.localize(datetime.strptime(trans_date,DEFAULT_SERVER_DATETIME_FORMAT)).astimezone(local)
    #trans_date = datetime.strftime(trans_date,"%Y-%m-%d %H:%M:%S") 
    #_logger.info(trans_date)
    return trans_date


def auth_trust():
    try:
        url = "http://apiindev.trustranch.co.id/login"
        payload='barcode=3000030930&password=weha.ID!!2020'
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        response = requests.request("POST", url, headers=headers, data=payload)
        str_json_data  = response.text.replace("'"," ")
        json_data = json.loads(str_json_data)
        _logger.info(json_data['data']['api_token'])
        return json_data['data']['api_token']
    except Exception as err:
        _logger.info(err)
        return False

#API for Sales
def send_data_to_trust(self):
    _logger.info("Send Data")
    trans_line_id = self.get_last_trans_line()
    _logger.info(trans_line_id.name)
    if self.voucher_trans_type in ('1','2','3'):
        trans_purchase_id = self.env['weha.voucher.trans.purchase'].search([('name','=',trans_line_id.name)], limit=1)

    api_token = self._auth_trust()
    if not api_token:
        self.is_send_to_crm = False
        self.send_to_crm_message = "Error Authentication"
        self.message_post(body="Send Notification to CRM Failed (Error Authentication)")
        return True, "Error CRM"

    headers = {'content-type': 'text/plain', 'charset':'utf-8'}
    base_url = 'http://apiindev.trustranch.co.id'
    try:
        vouchers = []
        vouchers.append(self.voucher_ean + ';' + self.expired_date.strftime('%Y-%m-%d') + ";" + self.voucher_sku)
        data = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'time': datetime.now().strftime('%H:%M:%S'),
            'receipt': trans_purchase_id.receipt_number,
            'transaction_id': trans_purchase_id.t_id,
            'cashier_id': trans_purchase_id.cashier_id,
            'store_id': trans_purchase_id.store_id,
            'member_id': self.member_id,
            'vouchers': '|'.join(vouchers)
        }
        _logger.info(data)
        headers = {'Authorization' : 'Bearer ' + api_token}
        req = requests.post('{}/vms/send-voucher'.format(base_url), headers=headers ,data=data)
        if req.status_code == 200:
            #Success
            response_json = req.json()
            self.is_send_to_crm = True
            self.message_post(body="Send Notification to CRM Successfully")
            _logger.info("Send Notification to CRM Successfully")
            return False, "Success"                
        else:
            #Error
            _logger.info(f'Error : {req.status_code}')
            _logger.info("Send Notification to CRM Error")
            if req.json():
                response_json = req.json()                
                _logger.info(f'Error Message: {response_json["message"]}')
                self.is_send_to_crm = False
                self.send_to_crm_message = response_json["message"]
                self.message_post(body=response_json["message"])
            else:
                self.is_send_to_crm = False
                self.send_to_crm_message = f'Error : {req.status_code}'

            return True, "Error CRM"

    except requests.exceptions.Timeout:
        # Maybe set up for a retry, or continue in a retry loop
        self.is_send_to_crm = False
        self.send_to_crm_message = "Error "
        self.message_post(body="Send Notification to CRM Failed (Timeout)")
        return True, "Error CRM"
    except requests.exceptions.TooManyRedirects:
        # Tell the user their URL was bad and try a different one
        self.is_send_to_crm = False
        self.send_to_crm_message = "Error Too Many Redirects"
        self.message_post(body="Send Notification to CRM Failed (TooManyRedirects)")
        return True, "Error CRM"
    except requests.exceptions.RequestException as e:
        _logger.info(e)
        self.is_send_to_crm = False
        self.send_to_crm_message = "Error Request"
        self.message_post(body=e)
        self.message_post(body="Send Notification to CRM Failed (Exception)")
        return True, "Error CRM"