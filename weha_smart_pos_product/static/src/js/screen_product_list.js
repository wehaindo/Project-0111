odoo.define("weha_smart_pos_product.ScreenProductList", function (require) {
    "use strict";
    
    var models = require("point_of_sale.models");
    var DB = require("point_of_sale.DB");
    var screens = require("point_of_sale.screens");
    var gui = require("point_of_sale.gui");
    var core = require("web.core");
    var QWeb = core.qweb;
    var rpc = require("web.rpc");
    var session = require("web.session");
    var field_utils = require("web.field_utils");

    var _t = core._t;

    var ProductListButton = screens.ActionButtonWidget.extend({
        template: "ProductListButton",
        button_click: function () {
            var self = this;
            self.gui.show_screen("product_list_screen");
        },
    });

    screens.define_action_button({
        name: "product_list_button",
        widget: ProductListButton,
    });

    var ProductListScreenWidget = screens.ScreenWidget.extend({
        template: "ProductListScreenWidget",

        show: function (options) {
            var self = this;
            this._super(options);

            this.$(".custom_searchbox input").keydown(function (e) {                              
                console.log(e.which); 
                if (
                    !(
                        (e.which >= 48 && e.which <= 57) ||   // 0–9
                        (e.which >= 65 && e.which <= 90) ||   // A–Z
                        (e.which >= 97 && e.which <= 122) ||  // a–z
                        e.which === 8 ||                      // Backspace
                        e.which === 32                        // Space
                    )
                ) {
                    e.preventDefault();
                }
                if ( e.shiftKey && (e.which >= 48 && e.which <= 57)){
                    e.preventDefault();
                }
                
                if (e.key === "Enter"){
                    console.log("Find Product");                    
                    // self.render_list([{id:1, name:"Product01", sku:"0000000", barcode:"00000000", price:200000}]);
                    const query = e.target.value
                    if (query.length == 0){
                        self.render_list([]);
                    }else{                     
                        rpc.query({
                            model: "product.product",
                            method: "query_with_available_pricelist",
                            args: [query, self.pos.config.pricelist_id[0]]
                        },{
                            timeout: 10000  // timeout in milliseconds (e.g., 10 seconds)
                        }).then(function (products) {    
                            console.log(products);                                                    
                            const products_json = JSON.parse(products);
                            if(products_json.length > 0){
                                console.log('products', products_json);                                
                                self.render_list(products_json);                        
                            }else{
                                self.render_list([]);          
                                self.gui.show_popup('alert', {
                                    title:  _t('Product List Information'),
                                    body:  _t('No Products Found')
                                });                                                                              
                            }
                            
                        });
                    }                                                                  
                }                
            });
        },        
        events: {
            "click .button.back": "click_back",
            "click .button.set-on-order": "add_to_order",
        },

        click_back: function () {
            this.gui.back();
        },

        add_to_order: function(ev){
            var self = this;
            const product_id = ev.currentTarget.dataset.id;            
            rpc.query({
                model: 'product.product',
                method: 'get_product_by_id_with_available_pricelist',
                args: [parseInt(product_id), self.pos.config.pricelist_id[0]],
            }).then(function (response) {
                console.log(response);                
                let product = JSON.parse(response);                                                               
                self.saveProductToStorage(product);                 
                var product_object = new models.Product({}, product);  
                console.log(product_object);                                           
                console.log(product_object.qty_available);      
                if(product_object.type === 'product'){
                    console.log('storaable');                    
                    const stock_quant = product_object.stock_quants.filter(val => val.location_id === self.pos.config.stock_location_id[0]);
                    console.log("stock_quant");
                    console.log(stock_quant);
                    if(stock_quant.length > 0){
                        let qty = 0;
                        stock_quant.forEach(quant => {
                            qty = qty + quant.quantity;
                        })
                        product_object.qty_available = qty;
                    }else{
                        product_object.qty_available = 0;
                    }                                        
                    if(product_object.qty_available > 0){                
                        console.log('qty_available');
                        self.pos.db.add_products([product_object]);                                       
                        var new_product = self.pos.db.get_product_by_id(product_object.id);
                        console.log(new_product);
                        console.log('add_product');
                        self.pos.get_order().add_product(new_product);                                
                        self.gui.back();
                    }else{
                        self.gui.show_popup('alert', {
                            title:  _t('Product Availability'),
                            body:  _t('Product not available')
                        });
                    }
                }else{
                    console.log('non storaable');
                    console.log(product_object);
                    self.pos.db.add_products([product_object]);                                       
                    var new_product = self.pos.db.get_product_by_id(product_object.id);
                    console.log(new_product);
                    console.log('add_product');
                    self.pos.get_order().add_product(new_product);                                
                    self.gui.back();
                }
                
            }).catch(function(error){
                console.log(error);
                self.gui.show_popup('alert', {
                    title:  _t('Product Not Found'),
                    body:  _t('No product found')
                });
                        
            });                        
        },

        render_list: function (products) {
            var self = this;
            var contents = self.$el[0].querySelector(".product-list-contents");
            contents.innerHTML = "";
            var cardContents = self.$el[0].querySelector(".product-card-list");
            cardContents.innerHTML = "";
            for (var i = 0, len = products.length; i < len; i++) {   
                var product_object = new models.Product({}, products[i]);          
                const stock_quant = product_object.stock_quants.filter(val => val.location_id === self.pos.config.stock_location_id[0]);
                console.log("stock_quant");
                console.log(stock_quant);
                if(stock_quant.length > 0){
                    let qty = 0;
                    stock_quant.forEach(quant => {
                        qty = qty + quant.quantity;
                    })
                    product_object.qty_available = qty;                    
                }else{
                    product_object.qty_available = 0;
                }
                
                console.log("get_price");     
                console.log(self.pos.config.pricelist_id[0]);
                console.log(product_object.get_price(self.pos.config.pricelist_id[0],1));
                console.log("get_price end");
                // Render Product List
                var clientline_html = QWeb.render("ProductListLine", { widget: self, product: product_object });                                                
                var clientline = document.createElement("tbody");
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);     
                // Render Product Card                
                var clientcard_html = QWeb.render("ProductCardLine", { widget: self, product: product_object });                                                                
                var clientcardline = document.createElement("div");
                clientcardline.innerHTML = clientcard_html;
                cardContents.appendChild(clientcardline);                
            }
        },   

        saveProductToStorage(product) {
            var request = indexedDB.open("OdooPOS", 1);            
            request.onsuccess = function (event) {
                var db = event.target.result;
                var transaction = db.transaction(["products"], "readwrite");
                var store = transaction.objectStore("products");
                store.put(product);
                console.log("Products saved to IndexedDB!");
            };            
        },

    });

    gui.define_screen({
        name: "product_list_screen",
        widget: ProductListScreenWidget,
    });

    return {
        ProductListScreenWidget: ProductListScreenWidget,
        ProductListButton: ProductListButton,
    };
});