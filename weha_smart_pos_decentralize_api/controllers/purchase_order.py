import json
import logging
import functools
import uuid
import odoo
import odoo.modules.registry
from odoo import fields, http
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

class PurchaseOrder(http.Controller):    

    @validate_token
    @http.route('/pos/decentralize/purchase/create', type="json", auth="none", methods=["POST"], csrf=False)
    def purchase_create(self, **kwargs):   
        try:
            data = request.jsonrequest
            # complete_data = self.complete_order_data(data)
            # _logger.info(complete_data)
            purchase_order = request.env['purchase.order'].create({
                'partner_id': data['partner_id'],    
            })
            for line in data['lines']:
                product_id = request.env['product.product'].browse(line['product_id'])
                line_1 = request.env['purchase.order.line'].create({
                    'order_id': purchase_order.id,
                    'product_id':product_id.id,
                    'name': product_id.name,
                    'product_qty': line['qty'],
                    'price_unit': line['price_unit'],  # Price for the first batch
                    'product_uom': product_id.uom_po_id.id,
                    'taxes_id': [(4,product_id.supplier_taxes_id.id)],
                    'date_planned': fields.Datetime.now(),
                    
                })

            # Confirm the Purchase Order
            purchase_order.button_confirm()            
            # Get the stock picking related to the purchase order
            pickings = request.env['stock.picking'].search([('origin', '=', purchase_order.name)])

            # Loop through all pickings generated for the purchase order
            for picking in pickings:
                # Set the quantity done to the quantity ordered for each move line
                for move_line in picking.move_line_ids:
                    move_line.qty_done = move_line.product_uom_qty  # Mark all products as received

                # Validate the picking (receipt)
                picking.button_validate()

            # Automatically Create Vendor Bill      
            _logger.info("Create Account Move")                  
            vendor_bill = request.env['account.move'].create({
                'type': 'in_invoice',
                'partner_id': purchase_order.partner_id.id,
                # 'currency_id': currency.id,
                'invoice_origin': purchase_order.name,
                'invoice_line_ids': [(0, 0, {
                    'product_id': line.product_id.id,
                    'quantity': line.product_qty,
                    'price_unit': line.price_unit,
                    'account_id': request.env['account.account'].search([('code', '=', '29000000')], limit=1).id,
                    'name': line.product_id.name,
                    'purchase_line_id': line.id
                }) for line in purchase_order.order_line],
            })
            _logger.info(vendor_bill)

            # Post the Vendor Bill to validate it
            vendor_bill.action_post()

            # Generate the PDF using the Odoo report engine
            pdf_report = request.env.ref('account.account_invoices').render_qweb_pdf(vendor_bill.id)[0]
            
            # Save the PDF to a file or return it for download
            
            # with open('/tmp/vendor_bill_{}.pdf'.format(vendor_bill.name), 'wb') as pdf_file:
            #     pdf_file.write(pdf_report)

            # print("Vendor bill PDF generated successfully!")
            
            data_return =  {
                "err": False,
                "message": '',
                "data": purchase_order.id     
            }
            return data_return
        except Exception as e:
            data_return =  {
                "err": False,
                "message": e,
                "data": []      
            }
            return data_return
