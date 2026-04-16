odoo.define('weha_smart_pos_base_data.models', function (require) {
    "use strict";
    
    var pos_model = require('point_of_sale.models');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;
    var utils = require('web.utils');
    var round_di = utils.round_decimals;
    var round_pr = utils.round_precision;
          
    var _posmodelproto = pos_model.PosModel.prototype;
    pos_model.PosModel = pos_model.PosModel.extend({
        initialize: function (session, attributes) {
            var self = this;
            _posmodelproto.initialize.call(this, session, attributes);                        
            if (window.indexedDB) {
                var request = indexedDB.open("OdooPOS", 1);

                request.onupgradeneeded = function (event) {
                    var db = event.target.result;
                    // db.createObjectStore('products', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('products')) {
                        db.createObjectStore('products', { keyPath: 'id' });
                    }
                };

                request.onsuccess = function (event) {
                    var db = event.target.result;
                    var transaction = db.transaction(["products"], "readwrite");
                    var store = transaction.objectStore("products");
                    console.log("Open Product IndexedDB!");
                };

                request.onerror = function (event) {
                    console.error("IndexedDB error: ", event.target.errorCode);
                };
            }                        
        },
        loadProductsFromIndexedDB: function(callback){
            if (!window.indexedDB) {
                console.warn("IndexedDB not supported.");
                return;
            }
            var request = indexedDB.open("OdooPOS", 1);
            request.onupgradeneeded = function (event) {
                var db = event.target.result;
                // db.createObjectStore('products', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'id' });
                }
            };
            request.onsuccess = function (event) {
                var db = event.target.result;
                var transaction = db.transaction(["products"], "readonly");
                var store = transaction.objectStore("products");

                var products = [];
                var getAllRequest = store.getAll();

                getAllRequest.onsuccess = function () {
                    products = getAllRequest.result;
                    console.log("Loaded products from IndexedDB:", products);
                    if (callback) callback(products);
                };
            };

        },
        load_server_data: function (){
            var self = this;              
            console.log(this.config);
            console.log(this.config_id);            
            var product_index = _.findIndex(this.models, function (model) {
                return model.model === "product.product";
            });
                
            var product_model = self.models[product_index];                        
            
            if (product_index !== -1) {
                this.models.splice(product_index, 1);
            }

            var product_pricelist_item_index = _.findIndex(this.models, function (model) {
                return model.model === "product.pricelist.item";
            });

            var product_pricelist_item_model = self.models[product_pricelist_item_index];
            
            // We don't want to load product.product the normal
            // uncached way, so get rid of it.
            if (product_pricelist_item_index !== -1) {
                this.models.splice(product_pricelist_item_index, 1);
            }

            var pos_order_index = _.findIndex(this.models, function (model) {
                return model.model === "pos.order";
            });
                
            var pos_order_model = self.models[product_index];                        
            
            if (pos_order_index !== -1) {
                this.models.splice(pos_order_index, 1);
            }

            this.loadProductsFromIndexedDB(function (products) {                
                console.log('loadProductsFromIndexedDB')
                console.log(products);
                // var using_company_currency = this.env.pos.config.currency_id[0] === this.company.currency_id[0];
                // var conversion_rate = this.currency.rate / this.company_currency.rate;
                self.db.add_products(_.map(products, function (product) {
                    // if (!using_company_currency) {
                    //     product.lst_price = round_pr(product.lst_price * conversion_rate, self.currency.rounding);
                    // }
                    // product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    product.pos = self;
                    return new pos_model.Product({}, product);
                }));
                console.log(self.db.product_by_id);                 
            });

            return _posmodelproto.load_server_data.apply(this, arguments);
        },                          
    });

    var _orderlineproto = pos_model.Orderline.prototype;    

    // pos_model.Orderline = pos_model.Orderline.extend({   
        // initialize: function(attr,options){            
        //     console.log('_initializeproto');                       
        //     rpc.query({
        //         model: 'product.product',
        //         method: 'get_product_by_id_with_available_pricelist',
        //         args: [options.json.product_id,  options.order.pricelist.id],
        //     }).then(function(response) {
        //         console.log('response');
        //         console.log(response);        
        //         let products = JSON.parse(response);    
        //         if(products.length > 0){
        //             console.log('product found');
        //             this.product = new pos_model.Product({}, products[0]);
        //             self.db.add_products([this.product]);
        //         }
        //         _orderlineproto.initialize.call(this, attr, options);        
        //     });                        
        // },
        //    init_from_JSON: function(json) {            
        //         this.product = this.pos.db.get_product_by_id(json.product_id);
        //         if (!this.product){
        //             this.product = this.getProductFromStorage(json.product_id);
        //         }
        //         _orderlineproto.init_from_JSON.apply(self, json);                
        //     },
        //     async getProductFromStorage(product_id) {
        //         try {
        //             let productDB = await localforage.getItem('pos_products') || {};
        //             return productDB[product_id] || null;
        //         } catch (error) {
        //             console.error("Error retrieving product from IndexedDB:", error);
        //             return null;
        //         }
        //     },
        // init_from_JSON: function(json) {            
        //     this.product = this.pos.db.get_product_by_id(json.product_id);
        //     if (!this.product){
        //         rpc.query({
        //             model: 'product.product',
        //             method: 'get_product_by_id_with_available_pricelist',
        //             args: [json.product_id, this.order.pricelist.id],
        //         }).then(function (response) {
        //             console.log('response');
        //             console.log(response);
        //             let products = JSON.parse(response);      
        //             console.log('products');
        //             console.log(products);     
        //             console.log(products[0]);    
        //             this.product = new pos_model.Product({}, products[0]);
        //             console.log('this.product');
        //             console.log(this.product);
        //             self.db.add_products([this.product]);  // Add to local DB   
        //             console.log('end inherit Orderline init_from_JSON');                                                                                 
        //         });     
        //     }            
        //     this.set_product_lot(this.product);
        //     this.price = json.price_unit;
        //     this.set_discount(json.discount);
        //     this.set_quantity(json.qty, 'do not recompute unit price');
        //     this.id = json.id ? json.id : orderline_id++;
        //     orderline_id = Math.max(this.id+1,orderline_id);
        //     var pack_lot_lines = json.pack_lot_ids;
        //     for (var i = 0; i < pack_lot_lines.length; i++) {
        //         var packlotline = pack_lot_lines[i][2];
        //         var pack_lot_line = new exports.Packlotline({}, {'json': _.extend(packlotline, {'order_line':this})});
        //         this.pack_lot_lines.add(pack_lot_line);
        //     }
        // },
        // init_from_JSON: async function(json)  {
        //     var self = this;
        //     console.log('start inherit Orderline init_from_JSON');
        //     console.log(json);
        //     await rpc.query({
        //         model: 'product.product',
        //         method: 'get_product_by_id_with_available_pricelist',
        //         args: [json.product_id, this.order.pricelist.id],
        //     }).then(function (response) {
        //         console.log('response');
        //         console.log(response);
        //         let product_object = JSON.parse(response);      
        //         console.log('product_object');
        //         console.log(product_object);         
        //         this.product = new pos_model.Product({}, product_object);
        //         console.log('this.product');
        //         console.log(this.product);
        //         self.db.add_products([this.product]);  // Add to local DB   
        //         console.log('end inherit Orderline init_from_JSON');                                                                                 
        //     });     
        //     _orderlineproto.init_from_JSON.apply(self, json);
        // }                                                             
    // });    
    // var OrderlineSuper = pos_model.Orderline.prototype.init_from_JSON;
    // pos_model.Orderline.prototype.init_from_JSON = async function(json){
    //     await this.fetchProductFromServer(json.product_id);   
    //     await OrderlineSuper.apply(this, arguments);
    // }
});
