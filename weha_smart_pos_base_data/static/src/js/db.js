odoo.define('weha_smart_pos_base_data.DB', function (require) {
    "use strict";

    var DB = require("point_of_sale.DB");
    var { Product } = require('point_of_sale.models');

    var _super_POSDB = DB.prototype;

    var save_prototype = DB.prototype.save;
    var add_products_prototype = DB.prototype.add_products;
    var get_product_by_id_prototype = DB.prototype.get_product_by_id;
    var get_product_by_barcode_prototype = DB.prototype.get_product_by_barcode;

    // DB.prototype.add_products = function(products){
    //     add_products_prototype.apply(this, arguments);
    //     console.log(products);   
    // }
    
    DB.prototype.save = function(store,data){
        console.log("Save DB Prototype");
        var self = this;
        // console.log(data);       
        save_prototype.apply(this, arguments);
        // Insert Data to CouchDB
        if(this.save_order_locally){
            if(store == 'unpaid_orders' || store == 'unpaid_orders_to_remove'){
                return
            }                
            if(data.length > 0){
                for(let dt of data){
                    console.log("Save Order to couchDb");
                    var id = dt.id;
                    var order_data = dt.data;        
                    console.log(order_data); 
                    // order_data["_id"] = order_data['access_token'];                                
                    order_data["_id"] = this.guid();                                
                    this.save_order_locally_conn.put(order_data).then(function (response) {
                        // handle response                        
                        console.log(response);                                                
                        self.save_order_locally_conn.replicate.to(self.pos_orders_pouch_db_conn);
                    }).catch(function (err) {
                        console.error(err);    
                        self.save_order_locally_conn.replicate.to(self.pos_orders_pouch_db_conn);                    
                    });                    
                }
            }            
        }   
    }
    
    DB.include({        
        init: function(options){
            var self = this;
            this._super(options);
        },

        set_pos_global_state: function(pos_global_state){
            this.pos_global_state = pos_global_state;
        },
        
        set_pos: function(pos){
            this.pos = pos;
        },

        set_is_pouchdb: function(is_pouchdb){
            this.is_pouchdb = is_pouchdb;
        },

        set_pouchdb_conn: function(conn){
            this.pouchdb_conn = conn;
        },

        set_is_product_barcode_pouchdb: function(is_product_barcode_pouch_db){
            this.is_product_barcode_pouch_db = is_product_barcode_pouch_db;
        },

        set_product_barcode_pouchdb_conn: function(conn){
            this.product_barcode_pouch_db_conn = conn;
        },

        set_is_product_category_pouchdb: function(is_product_category_pouch_db){
            this.is_product_category_pouch_db = is_product_category_pouch_db;
        },

        set_product_category_pouchdb_conn: function(conn){
            this.product_category_pouch_db_conn = conn;
        },
        
        set_is_product_pricelist_item_pouchdb: function(is_product_pricelist_item_pouch_db){
            this.is_product_pricelist_item_pouch_db = is_product_pricelist_item_pouch_db;
        },

        set_product_pricelist_item_pouchdb_conn: function(conn){
            this.product_pricelist_item_pouch_db_conn = conn;
        },
        set_save_order_locally: function(save_order_locally){
            this.save_order_locally = save_order_locally;
        },

        set_save_order_locally_conn: function(conn){
            this.save_order_locally_conn = conn;
        },

        set_is_pos_orders_pouchdb_conn: function(conn){
            this.pos_orders_pouch_db_conn = conn;
        },        
        guid: function() {
            function _p8(s) {
                var p = (Math.random().toString(16)+"000000000").substr(2,8);
                return s ? "-" + p.substr(0,4) + "-" + p.substr(4,4) : p ;
            }
            return _p8() + _p8(true) + _p8(true) + _p8();
        }
    });
});