from odoo import api, fields, models

class StockMove(models.Model):
    _inherit = 'stock.move'
    
    
    @api.depends('move_line_ids.product_qty')
    def _compute_reserved_availability(self):
        """ Fill the `availability` field on a stock move, which is the actual reserved quantity
        and is represented by the aggregated `product_qty` on the linked move lines. If the move
        is force assigned, the value will be 0.
        """
        # result = {data['move_id'][0]: data['product_qty'] for data in 
        #     self.env['stock.move.line'].read_group([('move_id', 'in', self.ids)], ['move_id','product_qty'], ['move_id'])}
        self.env.cr.execute("""
            SELECT move_id, SUM(product_qty)
            FROM stock_move_line
            WHERE move_id = ANY(%s)
            GROUP BY move_id
        """, (self.ids,))
        result = dict(self.env.cr.fetchall())
        for rec in self:
            rec.reserved_availability = rec.product_id.uom_id._compute_quantity(result.get(rec.id, 0.0), rec.product_uom, rounding_method='HALF-UP')
    
    