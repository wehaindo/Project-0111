odoo.define('weha_smart_pos_online.barcode_scan', function(require) {
    "use strict";

    var models = require('point_of_sale.models');
    var core = require('web.core');
    var rpc = require('web.rpc');

    var _t = core._t;
    var exports = {};

    // Extend POS Model to Customize Barcode Handling
    models.PosModel = models.PosModel.extend({
        // scan_product: function(parsed_code) {
        //     var self = this;
        //     var barcode = parsed_code.base_code;  // Get scanned barcode
            
        //     console.log("Scanned Barcode: ", barcode);

        //     rpc.query({
        //         model: 'product.product',
        //         method: 'get_product_by_barcode_with_available_pricelist',
        //         args: [barcode, self.config.pricelist_id[0]],
        //     }).then(function (response) {
        //         console.log(response);
        //         let product = JSON.parse(response);               
        //         var product_object = new models.Product({}, product);
        //         if(product_object.qty_available > 0){                
        //             console.log(product_object);
        //             self.db.add_products([product_object]);  // Add to local DB                        
        //             var new_product = self.db.get_product_by_id(product_object.id);
        //             console.log(new_product);
        //             console.log('add_product');
        //             self.get_order().add_product(new_product);                                
        //         }else{
        //             self.gui.show_popup('alert', {
        //                 title:  _t('Product Availability'),
        //                 body:  _t('Product not available')
        //             });
        //         }
        //     }).catch(function(error){
        //         console.log(error);
        //         self.gui.show_popup('alert', {
        //             title:  _t('Product Not Found'),
        //             body:  _t('No product found for barcode: ') + barcode
        //         });
                        
        //     });
        //     return true;

            // Search for the product in the POS product list
            // var product = self.db.get_product_by_barcode(barcode);

            // if (product) {
            //     console.log("Product Found Locally:", product);
            //     self.get_order().add_product(product);
            // } else {
            // If product is not found in local database, fetch from the server
            // rpc.query({
            //     model: 'product.product',
            //     method: 'get_product_by_barcode_with_available_pricelist',
            //     args: [[['barcode', '=', barcode],['product_id',]], ['id', 'display_name', 'lst_price', 'standard_price', 'categ_id', 'pos_categ_id', 'taxes_id',
            //     'barcode', 'default_code', 'to_weight', 'uom_id', 'description_sale', 'description',
            //     'product_tmpl_id','tracking']]
            // }).then(function(products) {
            //     if (products.length > 0) {
            //         var fetched_product = products[0];
            //         console.log("Product Retrieved from Server:", fetched_product);

            //         // Add the product dynamically
            //         var new_product = self.db.get_product_by_id(fetched_product.id);
            //         if (!new_product) {
            //             console.log('not new_product');
            //             var product_object = new models.Product({}, fetched_product);
            //             // var product_object = new exports.Product({}, fetched_product);
            //             self.db.add_products([product_object]);  // Add to local DB                        
            //             new_product = self.db.get_product_by_id(fetched_product.id);
            //             console.log(new_product)                            
            //         }
            //         console.log('add_product');
            //         self.get_order().add_product(new_product);
            //     } else {
            //         self.chrome.show_notification(
            //             _t('Product Not Found'),
            //             _t('No product found for barcode: ') + barcode
            //         );
            //     }
            // }).catch(function(error) {
            //     console.error("Error fetching product by barcode:", error);
            // });            
            // return true;


        // },       
    });


    models.Product = models.Product.extend({      

        // get_price: function(pricelist, quantity) {               
        //     var self = this;
        //     var date = moment().startOf('day');
    
        //     // In case of nested pricelists, it is necessary that all pricelists are made available in
        //     // the POS. Display a basic alert to the user in this case.
        //     if (pricelist === undefined) {
        //         alert(_t(
        //             'An error occurred when loading product prices. ' +
        //             'Make sure all pricelists are available in the POS.'
        //         ));
        //     }
    
        //     var category_ids = [];
        //     var category = this.categ;
        //     while (category) {
        //         category_ids.push(category.id);
        //         category = category.parent;
        //     }

            // var items = await this.get_remote_pricelist_item(pricelist, self.id);
            // var items = [
            //     {
            //         "id": 398376,
            //         "product_tmpl_id": [
            //             189947,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "product_id": [
            //             348012,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)"
            //         ],
            //         "categ_id": false,
            //         "min_quantity": 0,
            //         "applied_on": "0_product_variant",
            //         "base": "list_price",
            //         "base_pricelist_id": false,
            //         "pricelist_id": [
            //             4,
            //             "Thamrin Pricelist (IDR)"
            //         ],
            //         "price_surcharge": 0,
            //         "price_discount": 0,
            //         "price_round": 0,
            //         "price_min_margin": 0,
            //         "price_max_margin": 0,
            //         "company_id": [
            //             1,
            //             "PT Sarinah"
            //         ],
            //         "currency_id": [
            //             12,
            //             "IDR"
            //         ],
            //         "active": true,
            //         "date_start": false,
            //         "date_end": false,
            //         "compute_price": "fixed",
            //         "fixed_price": 7290000,
            //         "percent_price": 0,
            //         "name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "price": "Rp 7290000.00",
            //         "product_pricelist_item_couchdb_id": "productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6",
            //         "product_pricelist_item_json": "{\"id\": 398376, \"product_tmpl_id\": [189947, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"product_id\": [348012, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\"], \"categ_id\": false, \"min_quantity\": 0, \"applied_on\": \"0_product_variant\", \"base\": \"list_price\", \"base_pricelist_id\": false, \"pricelist_id\": [4, \"Thamrin Pricelist (IDR)\"], \"price_surcharge\": 0.0, \"price_discount\": 0.0, \"price_round\": 0.0, \"price_min_margin\": 0.0, \"price_max_margin\": 0.0, \"company_id\": [1, \"PT Sarinah\"], \"currency_id\": [12, \"IDR\"], \"active\": true, \"date_start\": false, \"date_end\": false, \"compute_price\": \"fixed\", \"fixed_price\": 7290000.0, \"percent_price\": 0.0, \"name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"price\": \"Rp 7290000.00\", \"product_pricelist_item_couchdb_id\": \"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\", \"product_pricelist_item_json\": \"{\\\"id\\\": 398376, \\\"product_tmpl_id\\\": [189947, \\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117\\\"], \\\"product_id\\\": [348012, \\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\"], \\\"categ_id\\\": false, \\\"min_quantity\\\": 0, \\\"applied_on\\\": \\\"0_product_variant\\\", \\\"base\\\": \\\"list_price\\\", \\\"base_pricelist_id\\\": false, \\\"pricelist_id\\\": [4, \\\"Thamrin Pricelist (IDR)\\\"], \\\"price_surcharge\\\": 0.0, \\\"price_discount\\\": 0.0, \\\"price_round\\\": 0.0, \\\"price_min_margin\\\": 0.0, \\\"price_max_margin\\\": 0.0, \\\"company_id\\\": [1, \\\"PT Sarinah\\\"], \\\"currency_id\\\": [12, \\\"IDR\\\"], \\\"active\\\": true, \\\"date_start\\\": false, \\\"date_end\\\": false, \\\"compute_price\\\": \\\"fixed\\\", \\\"fixed_price\\\": 7290000.0, \\\"percent_price\\\": 0.0, \\\"name\\\": \\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\", \\\"price\\\": \\\"Rp 7290000.00\\\", \\\"product_pricelist_item_couchdb_id\\\": \\\"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\\\", \\\"product_pricelist_item_json\\\": \\\"{\\\\\\\"id\\\\\\\": 398376, \\\\\\\"product_tmpl_id\\\\\\\": [189947, \\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117\\\\\\\"], \\\\\\\"product_id\\\\\\\": [348012, \\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\"], \\\\\\\"categ_id\\\\\\\": false, \\\\\\\"min_quantity\\\\\\\": 0, \\\\\\\"applied_on\\\\\\\": \\\\\\\"0_product_variant\\\\\\\", \\\\\\\"base\\\\\\\": \\\\\\\"list_price\\\\\\\", \\\\\\\"base_pricelist_id\\\\\\\": false, \\\\\\\"pricelist_id\\\\\\\": [4, \\\\\\\"Thamrin Pricelist (IDR)\\\\\\\"], \\\\\\\"price_surcharge\\\\\\\": 0.0, \\\\\\\"price_discount\\\\\\\": 0.0, \\\\\\\"price_round\\\\\\\": 0.0, \\\\\\\"price_min_margin\\\\\\\": 0.0, \\\\\\\"price_max_margin\\\\\\\": 0.0, \\\\\\\"company_id\\\\\\\": [1, \\\\\\\"PT Sarinah\\\\\\\"], \\\\\\\"currency_id\\\\\\\": [12, \\\\\\\"IDR\\\\\\\"], \\\\\\\"active\\\\\\\": true, \\\\\\\"date_start\\\\\\\": false, \\\\\\\"date_end\\\\\\\": false, \\\\\\\"compute_price\\\\\\\": \\\\\\\"fixed\\\\\\\", \\\\\\\"fixed_price\\\\\\\": 7290000.0, \\\\\\\"percent_price\\\\\\\": 0.0, \\\\\\\"name\\\\\\\": \\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\", \\\\\\\"price\\\\\\\": \\\\\\\"Rp 7290000.00\\\\\\\", \\\\\\\"product_pricelist_item_couchdb_id\\\\\\\": \\\\\\\"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\\\\\\\", \\\\\\\"product_pricelist_item_json\\\\\\\": \\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\": 398376, \\\\\\\\\\\\\\\"product_tmpl_id\\\\\\\\\\\\\\\": [189947, \\\\\\\\\\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"product_id\\\\\\\\\\\\\\\": [348012, \\\\\\\\\\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"categ_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"min_quantity\\\\\\\\\\\\\\\": 0, \\\\\\\\\\\\\\\"applied_on\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"0_product_variant\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"base\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"list_price\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"base_pricelist_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"pricelist_id\\\\\\\\\\\\\\\": [4, \\\\\\\\\\\\\\\"Thamrin Pricelist (IDR)\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"price_surcharge\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_discount\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_round\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_min_margin\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_max_margin\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"company_id\\\\\\\\\\\\\\\": [1, \\\\\\\\\\\\\\\"PT Sarinah\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"currency_id\\\\\\\\\\\\\\\": [12, \\\\\\\\\\\\\\\"IDR\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"active\\\\\\\\\\\\\\\": true, \\\\\\\\\\\\\\\"date_start\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"date_end\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"compute_price\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"fixed\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"fixed_price\\\\\\\\\\\\\\\": 7290000.0, \\\\\\\\\\\\\\\"percent_price\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"name\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"price\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Rp 7290000.00\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"product_pricelist_item_couchdb_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"product_pricelist_item_json\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"offer_msg\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"is_display_timer\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"branch_id\\\\\\\\\\\\\\\": [2, \\\\\\\\\\\\\\\"Thamrin Branch\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"department_id\\\\\\\\\\\\\\\": [54, \\\\\\\\\\\\\\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"vendor_product_id\\\\\\\\\\\\\\\": [233658, \\\\\\\\\\\\\\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"display_name\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"create_uid\\\\\\\\\\\\\\\": [660, \\\\\\\\\\\\\\\"Istitah Warastuty\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"create_date\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"2024-08-18T16:47:50.898170\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"write_uid\\\\\\\\\\\\\\\": [1, \\\\\\\\\\\\\\\"OdooBot\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"write_date\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"2025-03-04T03:29:57.155773\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"_id\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\\\\\\\\\\\\\\\"}\\\\\\\", \\\\\\\"offer_msg\\\\\\\": false, \\\\\\\"is_display_timer\\\\\\\": false, \\\\\\\"branch_id\\\\\\\": [2, \\\\\\\"Thamrin Branch\\\\\\\"], \\\\\\\"department_id\\\\\\\": [54, \\\\\\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\\\\\"], \\\\\\\"vendor_product_id\\\\\\\": [233658, \\\\\\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117\\\\\\\"], \\\\\\\"display_name\\\\\\\": \\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\", \\\\\\\"create_uid\\\\\\\": [660, \\\\\\\"Istitah Warastuty\\\\\\\"], \\\\\\\"create_date\\\\\\\": \\\\\\\"2024-08-18T16:47:50.898170\\\\\\\", \\\\\\\"write_uid\\\\\\\": [1, \\\\\\\"OdooBot\\\\\\\"], \\\\\\\"write_date\\\\\\\": \\\\\\\"2025-03-04T04:06:40.764970\\\\\\\", \\\\\\\"_id\\\\\\\": \\\\\\\"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\\\\\\\"}\\\", \\\"offer_msg\\\": false, \\\"is_display_timer\\\": false, \\\"branch_id\\\": [2, \\\"Thamrin Branch\\\"], \\\"department_id\\\": [54, \\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\"], \\\"vendor_product_id\\\": [233658, \\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117\\\"], \\\"display_name\\\": \\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\", \\\"create_uid\\\": [660, \\\"Istitah Warastuty\\\"], \\\"create_date\\\": \\\"2024-08-18T16:47:50.898170\\\", \\\"write_uid\\\": [1, \\\"OdooBot\\\"], \\\"write_date\\\": \\\"2025-03-04T07:36:57.089666\\\", \\\"_id\\\": \\\"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\\\"}\", \"offer_msg\": false, \"is_display_timer\": false, \"branch_id\": [2, \"Thamrin Branch\"], \"department_id\": [54, \"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\"], \"vendor_product_id\": [233658, \"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"display_name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"create_uid\": [660, \"Istitah Warastuty\"], \"create_date\": \"2024-08-18T16:47:50.898170\", \"write_uid\": [1, \"OdooBot\"], \"write_date\": \"2025-03-04T15:10:35.192788\", \"_id\": \"productpricelistitem_b154a916-2315-47cc-b0de-a10b413e50b6\"}",
            //         "offer_msg": false,
            //         "is_display_timer": false,
            //         "branch_id": [
            //             2,
            //             "Thamrin Branch"
            //         ],
            //         "department_id": [
            //             54,
            //             "Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store"
            //         ],
            //         "vendor_product_id": [
            //             233658,
            //             "[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "display_name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "create_uid": [
            //             660,
            //             "Istitah Warastuty"
            //         ],
            //         "create_date": "2024-08-18 16:47:50",
            //         "write_uid": [
            //             1,
            //             "OdooBot"
            //         ],
            //         "write_date": "2025-03-04 15:10:35",
            //         "__last_update": "2025-03-04 15:10:35"
            //     },
            //     {
            //         "id": 398373,
            //         "product_tmpl_id": [
            //             189947,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "product_id": [
            //             348012,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)"
            //         ],
            //         "categ_id": false,
            //         "min_quantity": 0,
            //         "applied_on": "0_product_variant",
            //         "base": "list_price",
            //         "base_pricelist_id": false,
            //         "pricelist_id": [
            //             4,
            //             "Thamrin Pricelist (IDR)"
            //         ],
            //         "price_surcharge": 0,
            //         "price_discount": 0,
            //         "price_round": 0,
            //         "price_min_margin": 0,
            //         "price_max_margin": 0,
            //         "company_id": [
            //             1,
            //             "PT Sarinah"
            //         ],
            //         "currency_id": [
            //             12,
            //             "IDR"
            //         ],
            //         "active": true,
            //         "date_start": false,
            //         "date_end": false,
            //         "compute_price": "fixed",
            //         "fixed_price": 7290000,
            //         "percent_price": 0,
            //         "name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "price": "Rp 7290000.00",
            //         "product_pricelist_item_couchdb_id": "productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679",
            //         "product_pricelist_item_json": "{\"id\": 398373, \"product_tmpl_id\": [189947, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"product_id\": [348012, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\"], \"categ_id\": false, \"min_quantity\": 0, \"applied_on\": \"0_product_variant\", \"base\": \"list_price\", \"base_pricelist_id\": false, \"pricelist_id\": [4, \"Thamrin Pricelist (IDR)\"], \"price_surcharge\": 0.0, \"price_discount\": 0.0, \"price_round\": 0.0, \"price_min_margin\": 0.0, \"price_max_margin\": 0.0, \"company_id\": [1, \"PT Sarinah\"], \"currency_id\": [12, \"IDR\"], \"active\": true, \"date_start\": false, \"date_end\": false, \"compute_price\": \"fixed\", \"fixed_price\": 7290000.0, \"percent_price\": 0.0, \"name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"price\": \"Rp 7290000.00\", \"product_pricelist_item_couchdb_id\": \"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\", \"product_pricelist_item_json\": \"{\\\"id\\\": 398373, \\\"product_tmpl_id\\\": [189947, \\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117\\\"], \\\"product_id\\\": [348012, \\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\"], \\\"categ_id\\\": false, \\\"min_quantity\\\": 0, \\\"applied_on\\\": \\\"0_product_variant\\\", \\\"base\\\": \\\"list_price\\\", \\\"base_pricelist_id\\\": false, \\\"pricelist_id\\\": [4, \\\"Thamrin Pricelist (IDR)\\\"], \\\"price_surcharge\\\": 0.0, \\\"price_discount\\\": 0.0, \\\"price_round\\\": 0.0, \\\"price_min_margin\\\": 0.0, \\\"price_max_margin\\\": 0.0, \\\"company_id\\\": [1, \\\"PT Sarinah\\\"], \\\"currency_id\\\": [12, \\\"IDR\\\"], \\\"active\\\": true, \\\"date_start\\\": false, \\\"date_end\\\": false, \\\"compute_price\\\": \\\"fixed\\\", \\\"fixed_price\\\": 7290000.0, \\\"percent_price\\\": 0.0, \\\"name\\\": \\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\", \\\"price\\\": \\\"Rp 7290000.00\\\", \\\"product_pricelist_item_couchdb_id\\\": \\\"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\\\", \\\"product_pricelist_item_json\\\": \\\"{\\\\\\\"id\\\\\\\": 398373, \\\\\\\"product_tmpl_id\\\\\\\": [189947, \\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117\\\\\\\"], \\\\\\\"product_id\\\\\\\": [348012, \\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\"], \\\\\\\"categ_id\\\\\\\": false, \\\\\\\"min_quantity\\\\\\\": 0, \\\\\\\"applied_on\\\\\\\": \\\\\\\"0_product_variant\\\\\\\", \\\\\\\"base\\\\\\\": \\\\\\\"list_price\\\\\\\", \\\\\\\"base_pricelist_id\\\\\\\": false, \\\\\\\"pricelist_id\\\\\\\": [4, \\\\\\\"Thamrin Pricelist (IDR)\\\\\\\"], \\\\\\\"price_surcharge\\\\\\\": 0.0, \\\\\\\"price_discount\\\\\\\": 0.0, \\\\\\\"price_round\\\\\\\": 0.0, \\\\\\\"price_min_margin\\\\\\\": 0.0, \\\\\\\"price_max_margin\\\\\\\": 0.0, \\\\\\\"company_id\\\\\\\": [1, \\\\\\\"PT Sarinah\\\\\\\"], \\\\\\\"currency_id\\\\\\\": [12, \\\\\\\"IDR\\\\\\\"], \\\\\\\"active\\\\\\\": true, \\\\\\\"date_start\\\\\\\": false, \\\\\\\"date_end\\\\\\\": false, \\\\\\\"compute_price\\\\\\\": \\\\\\\"fixed\\\\\\\", \\\\\\\"fixed_price\\\\\\\": 7290000.0, \\\\\\\"percent_price\\\\\\\": 0.0, \\\\\\\"name\\\\\\\": \\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\", \\\\\\\"price\\\\\\\": \\\\\\\"Rp 7290000.00\\\\\\\", \\\\\\\"product_pricelist_item_couchdb_id\\\\\\\": \\\\\\\"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\\\\\\\", \\\\\\\"product_pricelist_item_json\\\\\\\": \\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\": 398373, \\\\\\\\\\\\\\\"product_tmpl_id\\\\\\\\\\\\\\\": [189947, \\\\\\\\\\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"product_id\\\\\\\\\\\\\\\": [348012, \\\\\\\\\\\\\\\"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"categ_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"min_quantity\\\\\\\\\\\\\\\": 0, \\\\\\\\\\\\\\\"applied_on\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"0_product_variant\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"base\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"list_price\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"base_pricelist_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"pricelist_id\\\\\\\\\\\\\\\": [4, \\\\\\\\\\\\\\\"Thamrin Pricelist (IDR)\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"price_surcharge\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_discount\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_round\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_min_margin\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"price_max_margin\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"company_id\\\\\\\\\\\\\\\": [1, \\\\\\\\\\\\\\\"PT Sarinah\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"currency_id\\\\\\\\\\\\\\\": [12, \\\\\\\\\\\\\\\"IDR\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"active\\\\\\\\\\\\\\\": true, \\\\\\\\\\\\\\\"date_start\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"date_end\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"compute_price\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"fixed\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"fixed_price\\\\\\\\\\\\\\\": 7290000.0, \\\\\\\\\\\\\\\"percent_price\\\\\\\\\\\\\\\": 0.0, \\\\\\\\\\\\\\\"name\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"price\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Rp 7290000.00\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"product_pricelist_item_couchdb_id\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"product_pricelist_item_json\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"offer_msg\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"is_display_timer\\\\\\\\\\\\\\\": false, \\\\\\\\\\\\\\\"branch_id\\\\\\\\\\\\\\\": [2, \\\\\\\\\\\\\\\"Thamrin Branch\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"department_id\\\\\\\\\\\\\\\": [54, \\\\\\\\\\\\\\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"vendor_product_id\\\\\\\\\\\\\\\": [233658, \\\\\\\\\\\\\\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"display_name\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"create_uid\\\\\\\\\\\\\\\": [660, \\\\\\\\\\\\\\\"Istitah Warastuty\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"create_date\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"2024-08-18T16:47:50.898170\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"write_uid\\\\\\\\\\\\\\\": [1, \\\\\\\\\\\\\\\"OdooBot\\\\\\\\\\\\\\\"], \\\\\\\\\\\\\\\"write_date\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"2025-03-04T03:33:28.564593\\\\\\\\\\\\\\\", \\\\\\\\\\\\\\\"_id\\\\\\\\\\\\\\\": \\\\\\\\\\\\\\\"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\\\\\\\\\\\\\\\"}\\\\\\\", \\\\\\\"offer_msg\\\\\\\": false, \\\\\\\"is_display_timer\\\\\\\": false, \\\\\\\"branch_id\\\\\\\": [2, \\\\\\\"Thamrin Branch\\\\\\\"], \\\\\\\"department_id\\\\\\\": [54, \\\\\\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\\\\\"], \\\\\\\"vendor_product_id\\\\\\\": [233658, \\\\\\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117\\\\\\\"], \\\\\\\"display_name\\\\\\\": \\\\\\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\\\\\", \\\\\\\"create_uid\\\\\\\": [660, \\\\\\\"Istitah Warastuty\\\\\\\"], \\\\\\\"create_date\\\\\\\": \\\\\\\"2024-08-18T16:47:50.898170\\\\\\\", \\\\\\\"write_uid\\\\\\\": [1, \\\\\\\"OdooBot\\\\\\\"], \\\\\\\"write_date\\\\\\\": \\\\\\\"2025-03-04T04:08:35.051927\\\\\\\", \\\\\\\"_id\\\\\\\": \\\\\\\"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\\\\\\\"}\\\", \\\"offer_msg\\\": false, \\\"is_display_timer\\\": false, \\\"branch_id\\\": [2, \\\"Thamrin Branch\\\"], \\\"department_id\\\": [54, \\\"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\\\"], \\\"vendor_product_id\\\": [233658, \\\"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117\\\"], \\\"display_name\\\": \\\"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\\\", \\\"create_uid\\\": [660, \\\"Istitah Warastuty\\\"], \\\"create_date\\\": \\\"2024-08-18T16:47:50.898170\\\", \\\"write_uid\\\": [1, \\\"OdooBot\\\"], \\\"write_date\\\": \\\"2025-03-04T07:36:56.387721\\\", \\\"_id\\\": \\\"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\\\"}\", \"offer_msg\": false, \"is_display_timer\": false, \"branch_id\": [2, \"Thamrin Branch\"], \"department_id\": [54, \"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\"], \"vendor_product_id\": [233658, \"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"display_name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"create_uid\": [660, \"Istitah Warastuty\"], \"create_date\": \"2024-08-18T16:47:50.898170\", \"write_uid\": [1, \"OdooBot\"], \"write_date\": \"2025-03-04T15:10:36.083052\", \"_id\": \"productpricelistitem_fb9a224e-6c63-4cd1-a83a-6f70487a5679\"}",
            //         "offer_msg": false,
            //         "is_display_timer": false,
            //         "branch_id": [
            //             2,
            //             "Thamrin Branch"
            //         ],
            //         "department_id": [
            //             54,
            //             "Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store"
            //         ],
            //         "vendor_product_id": [
            //             233658,
            //             "[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "display_name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "create_uid": [
            //             660,
            //             "Istitah Warastuty"
            //         ],
            //         "create_date": "2024-08-18 16:47:50",
            //         "write_uid": [
            //             1,
            //             "OdooBot"
            //         ],
            //         "write_date": "2025-03-04 15:10:36",
            //         "__last_update": "2025-03-04 15:10:36"
            //     },
            //     {
            //         "id": 329175,
            //         "product_tmpl_id": [
            //             189947,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "product_id": [
            //             348012,
            //             "[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)"
            //         ],
            //         "categ_id": false,
            //         "min_quantity": 0,
            //         "applied_on": "0_product_variant",
            //         "base": "list_price",
            //         "base_pricelist_id": false,
            //         "pricelist_id": [
            //             4,
            //             "Thamrin Pricelist (IDR)"
            //         ],
            //         "price_surcharge": 0,
            //         "price_discount": 0,
            //         "price_round": 0,
            //         "price_min_margin": 0,
            //         "price_max_margin": 0,
            //         "company_id": [
            //             1,
            //             "PT Sarinah"
            //         ],
            //         "currency_id": [
            //             12,
            //             "IDR"
            //         ],
            //         "active": true,
            //         "date_start": "2024-01-25",
            //         "date_end": false,
            //         "compute_price": "fixed",
            //         "fixed_price": 7290000,
            //         "percent_price": 0,
            //         "name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "price": "Rp 7290000.00",
            //         "product_pricelist_item_couchdb_id": "productpricelistitem_d4de21a2-a350-4310-9e8a-0dc7264a933f",
            //         "product_pricelist_item_json": "{\"id\": 329175, \"product_tmpl_id\": [189947, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"product_id\": [348012, \"[PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\"], \"categ_id\": false, \"min_quantity\": 0, \"applied_on\": \"0_product_variant\", \"base\": \"list_price\", \"base_pricelist_id\": false, \"pricelist_id\": [4, \"Thamrin Pricelist (IDR)\"], \"price_surcharge\": 0.0, \"price_discount\": 0.0, \"price_round\": 0.0, \"price_min_margin\": 0.0, \"price_max_margin\": 0.0, \"company_id\": [1, \"PT Sarinah\"], \"currency_id\": [12, \"IDR\"], \"active\": true, \"date_start\": \"2024-01-25\", \"date_end\": false, \"compute_price\": \"fixed\", \"fixed_price\": 7290000.0, \"percent_price\": 0.0, \"name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"price\": \"Rp 7290000.00\", \"product_pricelist_item_couchdb_id\": false, \"product_pricelist_item_json\": false, \"offer_msg\": false, \"is_display_timer\": false, \"branch_id\": [2, \"Thamrin Branch\"], \"department_id\": [54, \"Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store\"], \"vendor_product_id\": [233658, \"[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117\"], \"display_name\": \"Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)\", \"create_uid\": [702, \"Karyanti\"], \"create_date\": \"2024-01-25T08:07:43.186117\", \"write_uid\": [1, \"OdooBot\"], \"write_date\": \"2025-03-04T11:04:55.118365\", \"_id\": \"productpricelistitem_d4de21a2-a350-4310-9e8a-0dc7264a933f\"}",
            //         "offer_msg": false,
            //         "is_display_timer": false,
            //         "branch_id": [
            //             2,
            //             "Thamrin Branch"
            //         ],
            //         "department_id": [
            //             54,
            //             "Head Office / Direktorat Retail / Divisi Speciality Store / Thamrin Store"
            //         ],
            //         "vendor_product_id": [
            //             233658,
            //             "[PRI0154327] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117"
            //         ],
            //         "display_name": "Variant: [PRI0154328] IWT KEMEJA BATIK TB PHOENIX LTR JLAMPRANG\tMN24000117 (HITAM, L, Lengan Panjang, COTTON)",
            //         "create_uid": [
            //             702,
            //             "Karyanti"
            //         ],
            //         "create_date": "2024-01-25 08:07:43",
            //         "write_uid": [
            //             1,
            //             "OdooBot"
            //         ],
            //         "write_date": "2025-03-04 11:04:55",
            //         "__last_update": "2025-03-04 11:04:55"
            //     }
            // ];

            // var items = self.available_pricelist_items || [];
            // console.log("Price fetched via RPC:", items);
            // console.log(items);
    
            // var pricelist_items = _.filter(items, function (item) {
            //     console.log(item);
            //     return (! item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
            //         (! item.product_id || item.product_id[0] === self.id) &&
            //         (! item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
            //         (! item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
            //         (! item.date_end || moment(item.date_end).isSameOrAfter(date));
            // });

            // console.log('pricelist_items');
            // console.log(pricelist_items)
                        
            // var price = self.lst_price;                
            // _.find(pricelist_items, function (rule) {
            //     if (rule.min_quantity && quantity < rule.min_quantity) {
            //         return false;
            //     }
    
            //     if (rule.base === 'pricelist') {
            //         price = self.get_price(rule.base_pricelist, quantity);
            //     } else if (rule.base === 'standard_price') {
            //         price = self.standard_price;
            //     }
    
            //     if (rule.compute_price === 'fixed') {
            //         console.log('fixed');
            //         price = rule.fixed_price;
            //         return true;
            //     } else if (rule.compute_price === 'percentage') {
            //         price = price - (price * (rule.percent_price / 100));
            //         return true;
            //     } else {
            //         var price_limit = price;
            //         price = price - (price * (rule.price_discount / 100));
            //         if (rule.price_round) {
            //             price = round_pr(price, rule.price_round);
            //         }
            //         if (rule.price_surcharge) {
            //             price += rule.price_surcharge;
            //         }
            //         if (rule.price_min_margin) {
            //             price = Math.max(price, price_limit + rule.price_min_margin);
            //         }
            //         if (rule.price_max_margin) {
            //             price = Math.min(price, price_limit + rule.price_max_margin);
            //         }
            //         return true;
            //     }
            //     return false;
            // });
            // console.log('price');
            // console.log(price); 
            // return price;

            // return rpc.query({
            //     model: 'product.pricelist.item',
            //     method: 'search_read',
            //     args: [[['pricelist_id','=', pricelist.id],['product_id','=', self.id]],[]],
            // }).then(function(items) {
            //     console.log("Price fetched via RPC:", items);
            //     console.log(items);
        
            //     var pricelist_items = _.filter(items, function (item) {
            //         console.log(item);
            //         return (! item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
            //             (! item.product_id || item.product_id[0] === self.id) &&
            //             (! item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
            //             (! item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
            //             (! item.date_end || moment(item.date_end).isSameOrAfter(date));
            //     });

            //     console.log('pricelist_items');
            //     console.log(pricelist_items)
                            
            //     var price = self.lst_price;                
            //     _.find(pricelist_items, function (rule) {
            //         if (rule.min_quantity && quantity < rule.min_quantity) {
            //             return false;
            //         }
        
            //         if (rule.base === 'pricelist') {
            //             price = self.get_price(rule.base_pricelist, quantity);
            //         } else if (rule.base === 'standard_price') {
            //             price = self.standard_price;
            //         }
        
            //         if (rule.compute_price === 'fixed') {
            //             console.log('fixed');
            //             price = rule.fixed_price;
            //             return true;
            //         } else if (rule.compute_price === 'percentage') {
            //             price = price - (price * (rule.percent_price / 100));
            //             return true;
            //         } else {
            //             var price_limit = price;
            //             price = price - (price * (rule.price_discount / 100));
            //             if (rule.price_round) {
            //                 price = round_pr(price, rule.price_round);
            //             }
            //             if (rule.price_surcharge) {
            //                 price += rule.price_surcharge;
            //             }
            //             if (rule.price_min_margin) {
            //                 price = Math.max(price, price_limit + rule.price_min_margin);
            //             }
            //             if (rule.price_max_margin) {
            //                 price = Math.min(price, price_limit + rule.price_max_margin);
            //             }
            //             return true;
            //         }
            //         return false;
            //     });
            //     console.log('price');
            //     console.log(price); 
            //     return price;
            // }).catch(function(error) {
            //     console.error("Error fetching product by barcode:", error);
            // });                     
            // This return value has to be rounded with round_di before
            // being used further. Note that this cannot happen here,
            // because it would cause inconsistencies with the backend for
            // pricelist that have base == 'pricelist'.
                                               
        // },
    
    });
});
