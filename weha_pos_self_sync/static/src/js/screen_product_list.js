odoo.define("weha_pos_self_sync.ScreenProductList", function (require) {
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
        
        init: function(parent, options) {
            this._super(parent, options);
            this.all_products = [];
            this.filtered_products = [];
            this.current_page = 1;
            this.items_per_page = 20;
        },

        show: function (options) {
            var self = this;
            this._super(options);
            
            // Reset page on open
            self.current_page = 1;

            // Load all products when screen is shown
            this.load_all_products();

            // Real-time search - search as you type with debounce
            var search_timeout = null;
            this.$(".productlist-searchbox input").on('input', function (e) {
                clearTimeout(search_timeout);
                search_timeout = setTimeout(function() {
                    self.perform_search(e.target.value);
                }, 300);
            });
            
            this.$(".productlist-searchbox input").keydown(function (e) {                              
                if (e.key === "Enter"){
                    clearTimeout(search_timeout);
                    self.perform_search(e.target.value);
                }                
            });
        },
        
        load_all_products: function() {
            var self = this;
            console.log("Loading all products...");
            
            // Show loading indicator
            var contents = self.$el[0].querySelector(".product-list-contents");
            contents.innerHTML = "<tr><td colspan='6' style='text-align: center; padding: 20px;'>Loading products...</td></tr>";
            
            // Check if lazy mode is enabled - load from IndexedDB
            if (self.pos.config.lazy_load_products) {
                console.log("Lazy mode enabled - loading from IndexedDB");
                self.load_products_from_indexeddb();
            } else {
                // Load from server
                self.load_products_from_server("");
            }
        },
        
        load_products_from_indexeddb: function() {
            var self = this;
            console.log("Reading from pos_hybrid_sync_db / products_cache ...");

            // Get active pricelist id
            var active_pricelist_id = null;
            if (self.pos.default_pricelist) {
                active_pricelist_id = self.pos.default_pricelist.id;
            } else if (self.pos.pricelists && self.pos.pricelists.length > 0) {
                active_pricelist_id = self.pos.pricelists[0].id;
            }

            // Load products + stock + pricelist items in parallel
            var p_products  = self.pos.db.get_products_from_indexeddb();
            var p_stock     = self.pos.db.get_all_stock_from_indexeddb();
            var p_pricelist = active_pricelist_id
                ? self.pos.db.get_pricelist_items_from_indexeddb(active_pricelist_id)
                : Promise.resolve([]);

            Promise.all([p_products, p_stock, p_pricelist]).then(function(results) {
                var products       = results[0];
                var stock_list     = results[1];
                var pricelist_items = results[2];

                console.log("IndexedDB → products:", products.length,
                            "| stock records:", stock_list.length,
                            "| pricelist items:", pricelist_items.length);

                if (products.length === 0) {
                    console.log("No products in IndexedDB, falling back to POS DB");
                    self.load_products_from_server("");
                    return;
                }

                // Build lookup maps for O(1) access
                var stock_map = {};
                stock_list.forEach(function(s) {
                    stock_map[s.product_id] = s.qty_available || 0;
                });

                // pricelist item lookup: product_id → fixed_price (only fixed-price rules)
                var price_map = {};
                pricelist_items.forEach(function(item) {
                    var pid = Array.isArray(item.product_id) ? item.product_id[0] : item.product_id;
                    if (pid && item.compute_price === 'fixed' && item.fixed_price !== undefined) {
                        // Use the item if no entry yet, or if min_quantity === 0 (default rule)
                        if (price_map[pid] === undefined || item.min_quantity === 0) {
                            price_map[pid] = item.fixed_price;
                        }
                    }
                });

                // Enrich each product with stock + pricelist price
                products.forEach(function(product) {
                    // Stock from IndexedDB
                    if (stock_map[product.id] !== undefined) {
                        product.qty_available = stock_map[product.id];
                    }
                    // Price from pricelist (override lst_price if a rule exists)
                    if (price_map[product.id] !== undefined) {
                        product.display_price = price_map[product.id];
                    } else {
                        product.display_price = product.lst_price || 0;
                    }
                });

                self.all_products = products;
                self.filtered_products = products;
                self.render_page();

            }).catch(function(err) {
                console.error("Error reading IndexedDB:", err);
                self.load_products_from_server("");
            });
        },
        
        // Shared helper: enrich products with pricelist + stock from IndexedDB, then render
        _enrich_and_render: function(products) {
            var self = this;
            var active_pricelist_id = null;
            if (self.pos.default_pricelist) {
                active_pricelist_id = self.pos.default_pricelist.id;
            } else if (self.pos.pricelists && self.pos.pricelists.length > 0) {
                active_pricelist_id = self.pos.pricelists[0].id;
            }

            var p_stock = self.pos.db.get_all_stock_from_indexeddb();
            var p_pricelist = active_pricelist_id
                ? self.pos.db.get_pricelist_items_from_indexeddb(active_pricelist_id)
                : Promise.resolve([]);

            Promise.all([p_stock, p_pricelist]).then(function(results) {
                var stock_list      = results[0];
                var pricelist_items = results[1];

                // Build stock map: product_id → qty_available
                var stock_map = {};
                stock_list.forEach(function(s) {
                    stock_map[s.product_id] = s.qty_available || 0;
                });

                // Build price map: product_id → fixed_price (lowest min_qty rule)
                var price_map = {};
                pricelist_items.forEach(function(item) {
                    var pid = Array.isArray(item.product_id) ? item.product_id[0] : item.product_id;
                    if (pid && item.compute_price === 'fixed' && item.fixed_price !== undefined) {
                        if (price_map[pid] === undefined || item.min_quantity === 0) {
                            price_map[pid] = item.fixed_price;
                        }
                    }
                });

                // Enrich
                products.forEach(function(p) {
                    if (stock_map[p.id] !== undefined) p.qty_available = stock_map[p.id];
                    p.display_price = price_map[p.id] !== undefined ? price_map[p.id] : (p.lst_price || 0);
                });

                self.all_products = products;
                self.filtered_products = products;
                self.render_page();
            }).catch(function(err) {
                console.warn("Could not enrich from IndexedDB, rendering without enrichment:", err);
                products.forEach(function(p) {
                    if (p.display_price === undefined) p.display_price = p.lst_price || 0;
                });
                self.all_products = products;
                self.filtered_products = products;
                self.render_page();
            });
        },

        load_products_from_server: function(query) {
            var self = this;
            var contents = self.$el[0].querySelector(".product-list-contents");
            
            // Get ALL products from POS DB (all categories)
            var db_products = [];
            if (self.pos.db && self.pos.db.product_by_id) {
                db_products = Object.values(self.pos.db.product_by_id);
            }

            if (db_products.length > 0 && !query) {
                console.log("Using products from POS DB:", db_products.length);
                self._enrich_and_render(db_products);
                return;
            }
            
            // Fallback to RPC call
            var domain = [['available_in_pos', '=', true]];
            if (query) {
                domain = ['|', '|',
                    ['name', 'ilike', query],
                    ['default_code', 'ilike', query],
                    ['barcode', 'ilike', query]
                ];
            }
            rpc.query({
                model: "product.product",
                method: "search_read",
                args: [domain],
                kwargs: {
                    fields: ['id', 'display_name', 'default_code', 'barcode', 'lst_price',
                             'standard_price', 'type', 'qty_available'],
                    limit: query ? 50 : 0,
                }
            },{
                timeout: 30000
            }).then(function (products) {
                console.log("Loaded from server:", products.length, "products");
                if (products.length > 0) {
                    // Add display_price from lst_price before enriching
                    products.forEach(function(p) { p.display_price = p.lst_price || 0; });
                    self._enrich_and_render(products);
                } else {
                    self.filtered_products = [];
                    self.render_list([]);
                    if (contents) contents.innerHTML = "<tr><td colspan='6' style='text-align: center; padding: 20px;'>No products available</td></tr>";
                }
            }).catch(function(error) {
                console.error("Error loading products:", error);
                if (contents) contents.innerHTML = "<tr><td colspan='6' style='text-align: center; padding: 20px; color: red;'>Error loading products. Please try again.</td></tr>";
            });
        },
        
        perform_search: function(query) {
            var self = this;
            self.current_page = 1;
            
            if (!query || query.trim().length === 0) {
                self.filtered_products = self.all_products;
                self.render_page();
                return;
            }
            
            query = query.toLowerCase().trim();
            
            self.filtered_products = self.all_products.filter(function(product) {
                return (product.display_name && product.display_name.toLowerCase().includes(query)) ||
                       (product.default_code && product.default_code.toLowerCase().includes(query)) ||
                       (product.barcode && product.barcode.toLowerCase().includes(query));
            });
            
            console.log("Filtered results:", self.filtered_products.length);
            self.render_page();
        },        
        events: {
            "click .button.back": "click_back",
            "click .button.set-on-order": "add_to_order",
            "click .btn-page-prev": "page_prev",
            "click .btn-page-next": "page_next",
        },

        click_back: function () {
            this.gui.show_screen('products');
        },

        page_prev: function() {
            if (this.current_page > 1) {
                this.current_page--;
                this.render_page();
            }
        },

        page_next: function() {
            var total_pages = Math.ceil(this.filtered_products.length / this.items_per_page);
            if (this.current_page < total_pages) {
                this.current_page++;
                this.render_page();
            }
        },

        render_page: function() {
            var self = this;
            var total = self.filtered_products.length;
            var total_pages = Math.max(1, Math.ceil(total / self.items_per_page));
            var start = (self.current_page - 1) * self.items_per_page;
            var end = Math.min(start + self.items_per_page, total);
            var page_products = self.filtered_products.slice(start, end);

            self.render_list(page_products);

            // Update pagination controls
            self.$('.pagination-info').text(
                'Page ' + self.current_page + ' of ' + total_pages +
                ' (' + total + ' products)'
            );
            self.$('.btn-page-prev').prop('disabled', self.current_page <= 1);
            self.$('.btn-page-next').prop('disabled', self.current_page >= total_pages);
        },

        add_to_order: function(ev){
            var self = this;
            const product_id = parseInt(ev.currentTarget.dataset.id);

            // Try POS in-memory DB first (non-lazy mode or already loaded)
            var product = self.pos.db.get_product_by_id(product_id);

            if (product) {
                self._do_add_product(product);
            } else {
                // Lazy mode: product only in IndexedDB — load it first
                var is_lazy = self.pos.config.sync_method === 'lazy' ||
                              self.pos.config.sync_method === 'hybrid' ||
                              self.pos.config.lazy_load_products;

                if (is_lazy && self.pos.db.indexedDB) {
                    console.log("Lazy mode: fetching product " + product_id + " from IndexedDB");
                    var transaction = self.pos.db.indexedDB.transaction(['products_cache'], 'readonly');
                    var store = transaction.objectStore('products_cache');
                    var request = store.get(product_id);

                    request.onsuccess = function(event) {
                        var idb_product = event.target.result;
                        if (idb_product) {
                            // Must convert raw JSON → proper models.Product instance
                            // (same pattern as models_extended.js _load_products_from_cache)
                            var using_company_currency = self.pos.config.currency_id[0] === self.pos.company.currency_id[0];
                            var conversion_rate = self.pos.currency.rate / self.pos.company_currency.rate;

                            if (!using_company_currency) {
                                idb_product.lst_price = Math.round(idb_product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                            }

                            // Resolve category
                            var categ = null;
                            if (idb_product.pos_categ_id && idb_product.pos_categ_id[0]) {
                                categ = _.findWhere(self.pos.pos_categ, {id: idb_product.pos_categ_id[0]});
                            }
                            if (!categ && idb_product.categ_id && idb_product.categ_id[0]) {
                                categ = _.findWhere(self.pos.product_categories, {id: idb_product.categ_id[0]});
                            }
                            idb_product.categ = categ || {id: 0, name: 'Uncategorized'};
                            idb_product.pos = self.pos;

                            // Instantiate as proper Product model
                            var product_model = new models.Product({}, idb_product);
                            self.pos.db.add_products([product_model]);

                            var loaded_product = self.pos.db.get_product_by_id(product_id);
                            if (loaded_product) {
                                self._do_add_product(loaded_product);
                            } else {
                                self._show_product_not_found();
                            }
                        } else {
                            self._show_product_not_found();
                        }
                    };

                    request.onerror = function() {
                        console.error("IndexedDB get failed for product " + product_id);
                        self._show_product_not_found();
                    };
                } else {
                    self._show_product_not_found();
                }
            }
        },

        _do_add_product: function(product) {
            var self = this;
            // Check stock for storable products
            if (product.type === 'product' && product.qty_available <= 0) {
                self.gui.show_popup('alert', {
                    title: _t('Out of Stock'),
                    body: _t('This product is currently out of stock.')
                });
                return;
            }
            self.pos.get_order().add_product(product);
            self.gui.show_screen('products');
        },

        _show_product_not_found: function() {
            this.gui.show_popup('alert', {
                title: _t('Product Not Found'),
                body: _t('Product could not be loaded. Please sync products first.')
            });
        },

        render_list: function (products) {
            var self = this;
            var contents = self.$el[0].querySelector(".product-list-contents");
            contents.innerHTML = "";
            var cardContents = self.$el[0].querySelector(".product-card-list");
            cardContents.innerHTML = "";
            
            for (var i = 0, len = products.length; i < len; i++) {
                var product = products[i];
                
                // For rendering, create a simple object with needed properties
                var product_data = {
                    id: product.id,
                    display_name: product.display_name || product.name,
                    default_code: product.default_code || '-',
                    barcode: product.barcode || '-',
                    display_price: product.display_price !== undefined ? product.display_price : (product.lst_price || 0),
                    qty_available: product.qty_available || 0,
                    type: product.type || 'consu'
                };
                
                // Render Product List
                var clientline_html = QWeb.render("ProductListLine", { 
                    widget: self, 
                    product: product_data 
                });
                var clientline = document.createElement("tbody");
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
                
                // Render Product Card
                var clientcard_html = QWeb.render("ProductCardLine", { 
                    widget: self, 
                    product: product_data 
                });
                var clientcardline = document.createElement("div");
                clientcardline.innerHTML = clientcard_html;
                cardContents.appendChild(clientcardline);
            }
        },
        
        format_currency: function(amount) {
            if (amount === undefined || amount === null) return '-';
            var currency = this.pos.currency;
            if (!currency) return parseFloat(amount).toFixed(2);
            var decimals = currency.decimals !== undefined ? currency.decimals : 2;
            var symbol = currency.symbol || '';
            var formatted = parseFloat(amount).toFixed(decimals);
            if (currency.position === 'before') {
                return symbol + ' ' + formatted;
            }
            return formatted + ' ' + symbol;
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
