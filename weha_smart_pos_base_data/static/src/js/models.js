odoo.define('weha_smart_pos_base_data.models', function (require) {
    "use strict";
    
    var pos_model = require('point_of_sale.models');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;


    
    // pos_model.load_models({
    //     label: 'pouchdb_products',
    //     loaded: function (self) {
    //         console.log('loaded pouchdb_products');
    //         var product_url = "https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products"
    //         var productsPouchdb = new PouchDB(product_url);                
    //         var localProducts = new PouchDB('Products')
    //         localProducts.replicate.from(productsPouchdb).then(function(result){
    //             console.log("Product Sync Finished");                    
    //             // self._loadProductProductPouchDB();                     
    //             localProducts.allDocs({
    //                 include_docs: true,
    //                 attachments: true,
    //                 startkey: 'product',                  
    //                 //   skip: skip,
    //                 //   limit: this.config.limited_products_amount
    //             }).then(function(pouchdb_products){
    //                 var rows = pouchdb_products.rows;            
    //                 var products = [];
    //                 rows.forEach((row) =>  {
    //                     products.push(row.doc);
    //                 })                        
    //                 console.log(products);
    //                 self.db.add_products(_.map(products, function (product) {
    //                     console.log(product);
    //                     product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
    //                     product.pos = self;
    //                     return new pos_model.Product({}, product);
    //                 }));
    //             }).catch(function (err) {
    //                 console.log(err);
    //             });                                                                
    //         }).catch(function(err){
    //             console.log(err);
    //         });
    //     }
    // });

    // pos_model.load_models({
    //     label: 'pouchdb_product_pricelist_items',
    //     loaded: function (self) {
    //         console.log('loaded pouchdb_product_pricelist_items');
    //         var product_pricelist_items_url = 'https://admin:pelang1@couchdb.server1601.weha-id.com/' + self.config.couchdb_product_pricelist_items;
    //         var productPricelistitemsPouchdb = new PouchDB(product_pricelist_items_url);                
    //         var localPricelistItems = new PouchDB('PricelistItems')
    //         localPricelistItems.replicate.from(productPricelistitemsPouchdb).then(function(result){
    //             console.log("Product Pricelist Items Sync Finished");                    
    //             // self._loadProductProductPouchDB();                     
    //             localPricelistItems.allDocs({
    //                 include_docs: true,
    //                 attachments: true,
    //                 startkey: 'productpricelistitem',                  
    //                 //   skip: skip,
    //                 //   limit: this.config.limited_products_amount
    //             }).then(function(pouchdb_product_pricelist_items){
    //                 var rows = pouchdb_product_pricelist_items.rows;            
    //                 var pouchdb_product_pricelist_items = [];
    //                 rows.forEach((row) =>  {
    //                     pouchdb_product_pricelist_items.push(row.doc);
    //                 })                        
    //                 var pricelist_by_id = {};
    //                 _.each(self.pricelists, function (pricelist) {
    //                     pricelist_by_id[pricelist.id] = pricelist;
    //                 });
    //                 _.each(pouchdb_product_pricelist_items, function (item) {
    //                     var pricelist = pricelist_by_id[item.pricelist_id[0]];
    //                     pricelist.items.push(item);
    //                     item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
    //                 });                    
    //                 console.log(pouchdb_product_pricelist_items);
    //             }).catch(function (err) {
    //                 console.log(err);
    //             });                                                                
    //         }).catch(function(err){
    //             console.log(err);
    //         });
    //     }
    // });


    var _posmodelproto = pos_model.PosModel.prototype;
    pos_model.PosModel = pos_model.PosModel.extend({

        
        // load_orders: function(){
        //     var jsons = this.db.get_unpaid_orders();
        //     var orders = [];
    
        //     for (var i = 0; i < jsons.length; i++) {
        //         var json = jsons[i];
        //         if (json.pos_session_id === this.pos_session.id) {
        //             orders.push(new exports.Order({},{
        //                 pos:  this,
        //                 json: json,
        //             }));
        //         }
        //     }
        //     for (var i = 0; i < jsons.length; i++) {
        //         var json = jsons[i];
        //         if (json.pos_session_id !== this.pos_session.id && (json.lines.length > 0 || json.statement_ids.length > 0)) {
        //             orders.push(new exports.Order({},{
        //                 pos:  this,
        //                 json: json,
        //             }));
        //         } else if (json.pos_session_id !== this.pos_session.id) {
        //             this.db.remove_unpaid_order(jsons[i]);
        //         }
        //     }
    
        //     orders = orders.sort(function(a,b){
        //         return a.sequence_number - b.sequence_number;
        //     });
    
        //     if (orders.length) {
        //         this.get('orders').add(orders);
        //     }
        // },
    
        after_load_server_data: async function(){
            var self = this;
            _posmodelproto.after_load_server_data.apply(this);
            console.log('after_load_server_data');         
            if(this.config.save_pos_order){
                await this._connectLocalDB();
            }
        },
        _connectLocalDB: async function(){
            console.log("connect localdb");
            var url = "https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_orders"
            this.remoteOrdersPouchDB = await new PouchDB(url);
            this.ordersPouchDB = await new PouchDB('Orders');
            this.db.set_save_order_locally(true);
            this.db.set_save_order_locally_conn(this.ordersPouchDB);
            this.db.set_is_pos_orders_pouchdb_conn(this.remoteOrdersPouchDB);
            this.ordersPouchDB.replicate.to(this.remoteOrdersPouchDB);
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

            return _posmodelproto.load_server_data.apply(this, arguments);
        },

        // load_server_data: function () {
        //     var self = this;
        //     console.log(this.config);
        //     console.log(this.pos);
        //     if(this.config.use_pos_data_speed_up){
        //         var product_index = _.findIndex(this.models, function (model) {
        //             return model.model === "product.product";
        //         });
        
        //         var product_model = self.models[product_index];
                
        //         // We don't want to load product.product the normal
        //         // uncached way, so get rid of it.
        //         if (product_index !== -1) {
        //             this.models.splice(product_index, 1);
        //         }
        //     }
            
        //     return _posmodelproto.load_server_data.apply(this, arguments).then(function () {            

        //         if(self.config.use_pos_data_speed_up){
        //             self.chrome.loading_message(_t('Loading') + ' product.product.from.local', 1);            
        //         var product_url = "https://admin:pelang1@couchdb.server1601.weha-id.com/dev_sarinah_products"
        //         var productsPouchdb = new PouchDB(product_url);                
        //         var localProducts = new PouchDB('Products')
        //         localProducts.replicate.from(productsPouchdb).then(function(result){
        //             console.log("Product Sync Finished");                    
        //             // self._loadProductProductPouchDB();                     
        //             localProducts.allDocs({
        //                 include_docs: true,
        //                 attachments: true,
        //                 startkey: 'product',                  
        //                 //   skip: skip,
        //                 //   limit: this.config.limited_products_amount
        //             }).then(function(pouchdb_products){
        //                 var rows = pouchdb_products.rows;            
        //                 var products = [];
        //                 rows.forEach((row) =>  {
        //                     products.push(row.doc);
        //                 })                        
        //                 console.log(products);
        //                 self.db.add_products(_.map(products, function (product) {
        //                     console.log(product);
        //                     product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
        //                     product.pos = self;
        //                     return new pos_model.Product({}, product);
        //                 }));
        //             }).catch(function (err) {
        //                 console.log(err);
        //             });                                                                
        //         }).catch(function(err){
        //             console.log(err);
        //         });
        //         }
                
        //     });
        // },
        
        loadPouchDBProduct: async function(skip){
            console.log('loadPouchDBProduct');
            try {
                var result = await this.localProducts.allDocs({
                  include_docs: true,
                  attachments: true,
                  startkey: 'product',                  
                //   skip: skip,
                //   limit: this.config.limited_products_amount
                });
                return result;
            } catch (err) {
                console.log(err);
            }
        },

        _loadProductProductPouchDB: async function(){
            console.log("_loadProductProductPouchDB")        
            let skip = 0;            
            var currentRows = 0;            
            var pouchdb_products =  await this.loadPouchDBProduct(skip);                
            var rows = pouchdb_products.rows;            
            var products = [];
            rows.forEach((row) =>  {
                products.push(row.doc);
            })                        
            console.log(products);
            await this.db.add_products(_.map(products, function (product) {
                console.log(product);
                product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                product.pos = self;
                return new pos_model.Product({}, product);
            }));
            // await this._loadProductProduct(products);
        }


    });
    
    // var _paylineproto = models.Paymentline.prototype;
    // pos_model.Paymentline = pos_model.Paymentline.extend({

    pos_model.Orderline = pos_model.Orderline.extend({
        init_from_JSON: function(json) {
            var self = this;
            console.log('inherit Orderline init_from_JSON');
            rpc.query({
                model: 'product.product',
                method: 'get_product_by_id_with_available_pricelist',
                args: [json.product_id, this.order.pricelist.id],
            }).then(function (response) {
                console.log(response);
                let product = JSON.parse(response);               
                let product_object = new pos_model.Product({}, product);
                console.log(product_object);
                if(product_object.qty_available > 0){                                    
                    self.pos.db.add_products([product_object]);  // Add to local DB                        
                    self.product = self.pos.db.get_product_by_id(product_object.id);
                    console.log('self.product');
                    console.log(self.product);
                    console.log('add_product');
                    // this.product = this.pos.db.get_product_by_id(json.product_id);
                    self.set_product_lot(self.product);
                    self.price = json.price_unit;
                    self.set_discount(json.discount);
                    self.set_quantity(json.qty, 'do not recompute unit price');
                    self.id = json.id ? json.id : self.orderline_id++;
                    self.orderline_id = Math.max(self.id+1,self.orderline_id);
                    var pack_lot_lines = json.pack_lot_ids;
                    for (var i = 0; i < pack_lot_lines.length; i++) {
                        var packlotline = pack_lot_lines[i][2];
                        var pack_lot_line = new exports.Packlotline({}, {'json': _.extend(packlotline, {'order_line':self})});
                        self.pack_lot_lines.add(pack_lot_line);
                    }
                                                  
                }else{
                    self.gui.show_popup('alert', {
                        title:  _t('Product Availability'),
                        body:  _t('Product not available')
                    });
                }
            }).catch(function(error){
                console.log(error);
                self.gui.show_popup('alert', {
                    title:  _t('Product Not Found'),
                    body:  _t('No product found for barcode: ') + barcode
                });
                        
            });
            
            
        },
    })
    
});
