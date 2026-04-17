odoo.define('weha_pos_self_sync.models_extended', function (require) {
"use strict";

const models = require('point_of_sale.models');
const rpc = require('web.rpc');

/**
 * Extend POS models for lazy loading and performance optimization
 */

// Store original load_server_data
const _super_posmodel = models.PosModel.prototype;
const _super_load_server_data = _super_posmodel.load_server_data;

models.PosModel = models.PosModel.extend({
    /**
     * Override to implement 3 loading modes:
     * - normal: Standard Odoo (load all products)
     * - lazy: Zero initial load (products load on search/scan only)
     * - hybrid: Load initial batch + on-demand
     */
    async load_server_data() {
        const self = this;
        
        // FIRST: Load config and other data (but not products yet)
        // We need to intercept product loading before parent loads them
        const original_models = models.PosModel.prototype.models;
        let product_model_backup = null;
        
        // Temporarily remove product.product from models list
        const models_to_load = original_models.filter(function(model) {
            if (model.model === 'product.product') {
                product_model_backup = model;
                return false; // Skip product loading for now
            }
            return true;
        });
        
        // Swap models temporarily
        models.PosModel.prototype.models = models_to_load;
        
        // Call parent to load everything EXCEPT products
        await _super_load_server_data.call(this);
        
        // Restore original models list
        models.PosModel.prototype.models = original_models;
        
        // Initialize IndexedDB after config is loaded
        if (this.db && this.db.init_indexed_db) {
            await this.db.init_indexed_db();
        }

        // Determine loading mode
        const sync_method = (this.config && this.config.sync_method) || 'normal';
        const hybrid_sync_enabled = this.config && this.config.enable_hybrid_sync;
        
        console.log(`📦 Loading mode: ${sync_method} (Hybrid Sync: ${hybrid_sync_enabled})`);

        if (!hybrid_sync_enabled || sync_method === 'normal') {
            // MODE 1: Normal POS - load all products using standard method
            console.log('✓ Loading all products (normal mode)...');
            
            if (product_model_backup) {
                // Load products using the original model definition
                await this.load_server_data_model(product_model_backup);
            }
            
            // Ensure all products are proper model instances
            var products_list = [];
            for (var id in this.db.product_by_id) {
                var product = this.db.product_by_id[id];
                // Check if product has the get_price method (is a proper Product instance)
                if (product && typeof product.get_price !== 'function') {
                    // Re-instantiate as proper Product model
                    product.pos = this;
                    var product_model = new models.Product({}, product);
                    products_list.push(product_model);
                }
            }
            
            // Re-add products as proper instances if needed
            if (products_list.length > 0) {
                console.log(`🔧 Re-instantiating ${products_list.length} products as proper models`);
                this.db.add_products(products_list);
            }
            
            console.log(`✓ Loaded ${Object.keys(this.db.product_by_id).length} products`);
            return true;
        }
        
        if (sync_method === 'lazy') {
            // MODE 2: Lazy Load - ZERO products at startup (skip product loading entirely)
            console.log('🚀 Lazy Load Mode: Skipping product load - will load on-demand only');
            
            // DO NOT load products at all
            // Just initialize empty product storage
            this.db.product_by_id = {};
            this.db.product_by_barcode = {};
            this.db.product_by_category_id = {};
            if (this.db.product_search_string) {
                this.db.product_search_string = {};
            }
            
            console.log('✓ Product loading skipped - products will load on search/scan');
            
            // Load partners
            await this._load_partners_from_cache();
            
            return true;
        }
        
        if (sync_method === 'hybrid') {
            // MODE 3: Hybrid - Load initial batch only
            const limit = (this.config && this.config.initial_product_limit) || 100;
            console.log(`🔄 Hybrid Mode: Loading only ${limit} initial products`);
            
            // Initialize empty product storage
            this.db.product_by_id = {};
            this.db.product_by_barcode = {};
            this.db.product_by_category_id = {};
            if (this.db.product_search_string) {
                this.db.product_search_string = {};
            }
            
            // Load limited products from cache or server
            await this._load_products_from_cache(limit);
            
            // Load partners
            await this._load_partners_from_cache();
            
            return true;
        }

        return true;
    },
    
    /**
     * Load a single model from server (helper for normal mode)
     */
    load_server_data_model: async function(model_obj) {
        const self = this;
        const loaded = await this.load_model(model_obj);
        return loaded;
    },

    /**
     * Load products from IndexedDB cache
     */
    _load_products_from_cache: async function(limit) {
        var self = this;
        limit = limit || 100;
        
        try {
            const cached_products = await this.db.get_products_from_indexeddb(null, limit);
            
            if (cached_products && cached_products.length > 0) {
                console.log(`✓ Loaded ${cached_products.length} products from IndexedDB`);
                
                // Convert to Product model instances
                var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                var conversion_rate = this.currency.rate / this.company_currency.rate;
                
                var product_models = _.map(cached_products, function (product) {
                    if (!using_company_currency) {
                        product.lst_price = Math.round(product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    // Try to find category from pos_categ_id first, then categ_id
                    var categ = null;
                    if (product.pos_categ_id && product.pos_categ_id[0]) {
                        categ = _.findWhere(self.pos_categ, {'id': product.pos_categ_id[0]});
                    }
                    if (!categ && product.categ_id && product.categ_id[0]) {
                        categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    }
                    // Fallback to uncategorized if no category found
                    product.categ = categ || { id: 0, name: 'Uncategorized' };
                    product.pos = self;
                    return new models.Product({}, product);
                });
                
                this.db.add_products(product_models);
            } else {
                // No cache, load initial batch from server
                console.log('⚠ No product cache, loading from server...');
                await this._load_initial_products_from_server(limit);
            }
        } catch (error) {
            console.error('Error loading products from cache:', error);
            // Fallback to server load
            await this._load_initial_products_from_server(limit);
        }
    },

    /**
     * Load initial products from server
     */
    _load_initial_products_from_server: async function(limit) {
        var self = this;
        try {
            const domain = [['available_in_pos', '=', true]];
            
            // Get available product IDs from config if available
            if (this.config && this.config.iface_available_categ_ids && this.config.iface_available_categ_ids.length) {
                domain.push(['pos_categ_id', 'in', this.config.iface_available_categ_ids]);
            }

            // Find product model definition
            let product_fields = ['id', 'name', 'display_name', 'lst_price', 'standard_price',
                'categ_id', 'pos_categ_id', 'taxes_id', 'barcode', 'default_code',
                'to_weight', 'uom_id', 'description_sale', 'description',
                'product_tmpl_id', 'tracking', 'write_date', 'available_in_pos'];

            const products = await rpc.query({
                model: 'product.product',
                method: 'search_read',
                args: [domain, product_fields],
                kwargs: {
                    limit: limit
                }
            });

            if (products && products.length > 0) {
                console.log(`Loaded ${products.length} initial products from server`);
                
                // Convert to Product model instances
                var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                var conversion_rate = this.currency.rate / this.company_currency.rate;
                
                var product_models = _.map(products, function (product) {
                    if (!using_company_currency) {
                        product.lst_price = Math.round(product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    // Try to find category from pos_categ_id first, then categ_id
                    var categ = null;
                    if (product.pos_categ_id && product.pos_categ_id[0]) {
                        categ = _.findWhere(self.pos_categ, {'id': product.pos_categ_id[0]});
                    }
                    if (!categ && product.categ_id && product.categ_id[0]) {
                        categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    }
                    // Fallback to uncategorized if no category found
                    product.categ = categ || { id: 0, name: 'Uncategorized' };
                    product.pos = self;
                    return new models.Product({}, product);
                });
                
                this.db.add_products(product_models);
                
                // Cache to IndexedDB
                await this.db.save_products_to_indexeddb(products);
            }

        } catch (error) {
            console.error('Error loading initial products:', error);
        }
    },



    /**
     * Load partners from IndexedDB cache
     */
    _load_partners_from_cache: async function() {
        try {
            const cached_partners = await this.db.get_partners_from_indexeddb();
            
            if (cached_partners && cached_partners.length > 0) {
                console.log(`Loaded ${cached_partners.length} partners from cache`);
                this.db.add_partners(cached_partners);
            } else {
                // Load minimal partners from server
                await this._load_initial_partners_from_server();
            }
        } catch (error) {
            console.error('Error loading partners from cache:', error);
            await this._load_initial_partners_from_server();
        }
    },

    /**
     * Load initial partners from server
     */
    _load_initial_partners_from_server: async function() {
        try {
            // Use standard partner fields
            let partner_fields = ['id', 'name', 'street', 'city', 'state_id', 'country_id',
                'vat', 'phone', 'zip', 'mobile', 'email', 'barcode', 'write_date'];

            const partners = await rpc.query({
                model: 'res.partner',
                method: 'search_read',
                args: [[], partner_fields],
                kwargs: {
                    limit: 500
                }
            });

            if (partners && partners.length > 0) {
                console.log(`Loaded ${partners.length} partners from server`);
                this.db.add_partners(partners);
                
                // Cache to IndexedDB
                await this.db.save_partners_to_indexeddb(partners);
            }

        } catch (error) {
            console.error('Error loading initial partners:', error);
        }
    },



    /**
     * Load products by category (lazy loading)
     */
    load_products_by_category: async function(category_id) {
        try {
            console.log('Loading products for category:', category_id);

            const products = await rpc.query({
                route: '/pos/get_products_by_category',
                params: {
                    category_id: category_id,
                    session_id: this.pos_session.id,
                    limit: 200,
                    offset: 0
                }
            });

            if (products && products.length > 0) {
                console.log(`Loaded ${products.length} products for category ${category_id}`);
                
                // Convert to Product model instances
                var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                var conversion_rate = this.currency.rate / this.company_currency.rate;
                var self = this;
                
                var product_models = _.map(products, function (product) {
                    // Skip if already a Product model instance
                    if (product instanceof models.Product) {
                        return product;
                    }
                    
                    if (!using_company_currency) {
                        product.lst_price = Math.round(product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    // Try to find category from pos_categ_id first, then categ_id
                    var categ = null;
                    if (product.pos_categ_id && product.pos_categ_id[0]) {
                        categ = _.findWhere(self.pos_categ, {'id': product.pos_categ_id[0]});
                    }
                    if (!categ && product.categ_id && product.categ_id[0]) {
                        categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    }
                    // Fallback to uncategorized if no category found
                    product.categ = categ || { id: 0, name: 'Uncategorized' };
                    product.pos = self;
                    return new models.Product({}, product);
                });
                
                // Add to POS DB
                this.db.add_products(product_models);
                
                // Cache to IndexedDB
                await this.db.save_products_to_indexeddb(products);
                
                // Trigger UI update
                this.trigger('products-loaded', { category_id, count: product_models.length });
                
                return product_models;
            }

            return [];

        } catch (error) {
            console.error('Error loading products by category:', error);
            return [];
        }
    },

    /**
     * Search products (on-demand loading for lazy/hybrid modes)
     */
    search_products_server: async function(query) {
        try {
            console.log('🔍 Searching products:', query);

            // First check IndexedDB cache
            let products = [];
            let from_cache = false;
            try {
                products = await this.db.search_products_in_indexeddb(query, 50);
                if (products && products.length > 0) {
                    console.log(`✓ Found ${products.length} products in IndexedDB cache`);
                    from_cache = true;
                } else {
                    console.log('⚠ No products found in IndexedDB cache');
                }
            } catch (e) {
                console.log('IndexedDB search failed, will search server:', e);
            }

            // If not found in cache, search server
            if (!products || products.length === 0) {
                console.log('🌐 Searching server for:', query);
                
                try {
                    // Try custom route first
                    products = await rpc.query({
                        route: '/pos/search_products',
                        params: {
                            query: query,
                            session_id: this.pos_session.id,
                            limit: 50
                        }
                    });
                    console.log('✓ Server returned', products ? products.length : 0, 'products');
                } catch (route_error) {
                    console.warn('Custom route failed, using standard search:', route_error);
                    
                    // Fallback to standard RPC search
                    products = await rpc.query({
                        model: 'product.product',
                        method: 'search_read',
                        args: [[
                            '|', '|', '|',
                            ['name', 'ilike', query],
                            ['display_name', 'ilike', query],
                            ['barcode', '=', query],
                            ['default_code', 'ilike', query],
                            ['available_in_pos', '=', true]
                        ], [
                            'id', 'name', 'display_name', 'lst_price', 'standard_price',
                            'categ_id', 'pos_categ_id', 'taxes_id', 'barcode',
                            'default_code', 'to_weight', 'uom_id', 'description_sale',
                            'description', 'product_tmpl_id', 'tracking', 'write_date'
                        ]],
                        kwargs: { limit: 50 }
                    });
                    console.log('✓ Standard search returned', products ? products.length : 0, 'products');
                }
            }

            if (products && products.length > 0) {
                console.log(`✓ Processing ${products.length} products for query: ${query}`);
                
                // Convert to Product model instances (both from cache and server)
                var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                var conversion_rate = this.currency.rate / this.company_currency.rate;
                var self = this;
                
                var product_models = _.map(products, function (product) {
                    // Skip if already a Product model instance
                    if (product instanceof models.Product) {
                        return product;
                    }
                    
                    if (!using_company_currency) {
                        product.lst_price = Math.round(product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    // Try to find category from pos_categ_id first, then categ_id
                    var categ = null;
                    if (product.pos_categ_id && product.pos_categ_id[0]) {
                        categ = _.findWhere(self.pos_categ, {'id': product.pos_categ_id[0]});
                    }
                    if (!categ && product.categ_id && product.categ_id[0]) {
                        categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    }
                    // Fallback to uncategorized if no category found
                    product.categ = categ || { id: 0, name: 'Uncategorized' };
                    product.pos = self;
                    return new models.Product({}, product);
                });
                
                // Add to POS DB
                this.db.add_products(product_models);
                
                // Cache to IndexedDB (only if from server)
                if (!from_cache) {
                    await this.db.save_products_to_indexeddb(products);
                }
                
                return product_models;
            }

            return [];

        } catch (error) {
            console.error('Error searching products:', error);
            return [];
        }
    },
    
    /**
     * Get product by barcode (on-demand for lazy mode)
     */
    get_product_by_barcode: async function(barcode) {
        var self = this;
        
        // Try local memory DB first
        var product = this.db.get_product_by_barcode(barcode);
        if (product) {
            return product;
        }
        
        // If lazy/hybrid mode and not found locally, check IndexedDB then server
        const sync_method = (this.config && this.config.sync_method) || 'normal';
        
        if (sync_method === 'lazy' || sync_method === 'hybrid') {
            console.log(`🔍 Product ${barcode} not in memory, checking IndexedDB...`);
            
            // Try IndexedDB first
            try {
                const cached_product = await this.db.get_product_by_barcode_from_indexeddb(barcode);
                if (cached_product) {
                    console.log(`✓ Product found in IndexedDB: ${cached_product.display_name}`);
                    
                    // Convert to Product model and add to memory
                    var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                    var conversion_rate = this.currency.rate / this.company_currency.rate;
                    
                    if (!using_company_currency) {
                        cached_product.lst_price = Math.round(cached_product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    var categ = null;
                    if (cached_product.pos_categ_id && cached_product.pos_categ_id[0]) {
                        categ = _.findWhere(this.pos_categ, {'id': cached_product.pos_categ_id[0]});
                    }
                    if (!categ && cached_product.categ_id && cached_product.categ_id[0]) {
                        categ = _.findWhere(this.product_categories, {'id': cached_product.categ_id[0]});
                    }
                    cached_product.categ = categ || { id: 0, name: 'Uncategorized' };
                    cached_product.pos = this;
                    
                    var product_model = new models.Product({}, cached_product);
                    this.db.add_products([product_model]);
                    
                    return product_model;
                }
            } catch (e) {
                console.log('IndexedDB lookup failed:', e);
            }
            
            console.log(`🌐 Product not in IndexedDB, searching server...`);
            
            try {
                const products = await rpc.query({
                    model: 'product.product',
                    method: 'search_read',
                    args: [[
                        ['barcode', '=', barcode],
                        ['available_in_pos', '=', true]
                    ], [
                        'id', 'name', 'display_name', 'lst_price', 'standard_price',
                        'categ_id', 'pos_categ_id', 'taxes_id', 'barcode',
                        'default_code', 'to_weight', 'uom_id', 'description_sale',
                        'description', 'product_tmpl_id', 'tracking', 'write_date'
                    ]],
                    kwargs: { limit: 1 }
                });
                
                if (products && products.length > 0) {
                    var product_data = products[0];
                    
                    console.log(`✓ Product found on server: ${product_data.display_name}`);
                    
                    // Convert to Product model
                    var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                    var conversion_rate = this.currency.rate / this.company_currency.rate;
                    
                    if (!using_company_currency) {
                        product_data.lst_price = Math.round(product_data.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    // Try to find category from pos_categ_id first, then categ_id
                    var categ = null;
                    if (product_data.pos_categ_id && product_data.pos_categ_id[0]) {
                        categ = _.findWhere(this.pos_categ, {'id': product_data.pos_categ_id[0]});
                    }
                    if (!categ && product_data.categ_id && product_data.categ_id[0]) {
                        categ = _.findWhere(this.product_categories, {'id': product_data.categ_id[0]});
                    }
                    // Fallback to uncategorized if no category found
                    product_data.categ = categ || { id: 0, name: 'Uncategorized' };
                    product_data.pos = this;
                    
                    var product_model = new models.Product({}, product_data);
                    
                    // Add to local cache
                    this.db.add_products([product_model]);
                    
                    // Save to IndexedDB
                    await this.db.save_products_to_indexeddb([product_data]);
                    
                    return product_model;
                }
            } catch (error) {
                console.error('Error fetching product from server:', error);
            }
        }
        
        return undefined;
    },

    /**
     * Override scan_product to support lazy/hybrid loading from IndexedDB
     */
    scan_product: async function(parsed_code) {
        const sync_method = (this.config && this.config.sync_method) || 'normal';
        
        // For lazy/hybrid modes, try IndexedDB first
        if (sync_method === 'lazy' || sync_method === 'hybrid') {
            console.log(`🔍 Scanning barcode (${sync_method} mode): ${parsed_code.code}`);
            
            // First check memory
            var product = this.db.get_product_by_barcode(parsed_code.code);
            
            if (!product) {
                // Not in memory, check IndexedDB and server
                product = await this.get_product_by_barcode(parsed_code.code);
            }
            
            if (product) {
                console.log(`✓ Product found: ${product.display_name}`);
                
                // If parent method exists, call it with the product
                if (_super_posmodel.scan_product) {
                    return _super_posmodel.scan_product.call(this, parsed_code);
                }
                
                // Otherwise handle directly
                if (parsed_code.type === 'price') {
                    this.get_order().add_product(product, {price: parsed_code.value});
                } else if (parsed_code.type === 'weight') {
                    this.get_order().add_product(product, {quantity: parsed_code.value, merge: false});
                } else if (parsed_code.type === 'discount') {
                    this.get_order().add_product(product, {discount: parsed_code.value, merge: false});
                } else {
                    this.get_order().add_product(product);
                }
                
                return true;
            } else {
                console.warn(`⚠ Product not found for barcode: ${parsed_code.code}`);
                return false;
            }
        }
        
        // Normal mode - use parent method
        if (_super_posmodel.scan_product) {
            return _super_posmodel.scan_product.call(this, parsed_code);
        }
        
        return false;
    },
});

// Extend Order model to add UUID
const _super_order = models.Order.prototype;

models.Order = models.Order.extend({
    initialize: function(attributes, options) {
        _super_order.initialize.apply(this, arguments);
        
        // Generate UUID if not present
        if (!this.uuid) {
            this.uuid = this._generate_uuid();
        }
    },

    export_as_JSON: function() {
        const json = _super_order.export_as_JSON.apply(this, arguments);
        
        // Add UUID to export
        json.uuid = this.uuid || this._generate_uuid();
        
        return json;
    },

    _generate_uuid: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
});

// Extend Product model to ensure get_display_price and get_price methods exist
const _super_product = models.Product.prototype;

models.Product = models.Product.extend({
    /**
     * Get product price with pricelist applied
     */
    get_price: function(pricelist, quantity) {
        var self = this;
        var date = moment().startOf('day');
        
        // If no pricelist, return standard price
        if (!pricelist) {
            return this.lst_price || 0;
        }

        // Find matching pricelist item
        var price = this.lst_price || 0;
        var items = [];
        
        // Get pricelist items for this product
        if (pricelist.items) {
            items = _.filter(pricelist.items, function(item) {
                return (!item.product_id || item.product_id[0] === self.id) &&
                       (!item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id[0]) &&
                       (!item.categ_id || item.categ_id[0] === self.categ_id[0]) &&
                       (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                       (!item.date_end || moment(item.date_end).isSameOrAfter(date));
            });
        }

        // Apply pricelist rules
        if (items.length > 0) {
            // Sort by specificity (product > template > category)
            items = _.sortBy(items, function(item) {
                if (item.product_id) return 0;
                if (item.product_tmpl_id) return 1;
                if (item.categ_id) return 2;
                return 3;
            });

            var item = items[0];
            if (item.compute_price === 'fixed') {
                price = item.fixed_price;
            } else if (item.compute_price === 'percentage') {
                price = this.lst_price - (this.lst_price * (item.percent_price / 100));
            } else if (item.compute_price === 'formula') {
                var base_price = this.lst_price;
                price = base_price * (1 + item.price_surcharge / 100) + item.price_discount;
            }
        }

        return price;
    },

    /**
     * Get display price (with or without taxes based on config)
     */
    get_display_price: function(pricelist, quantity) {
        var self = this;
        var price = this.get_price(pricelist, quantity);
        
        if (this.pos && this.pos.config && this.pos.config.iface_tax_included === 'total') {
            var taxes = [];
            if (this.taxes_id && this.taxes_id.length > 0) {
                this.taxes_id.forEach(function(tax_id) {
                    if (self.pos.taxes_by_id && self.pos.taxes_by_id[tax_id]) {
                        taxes.push(self.pos.taxes_by_id[tax_id]);
                    }
                });
            }
            
            if (taxes.length > 0 && this.pos.compute_all) {
                var all_taxes = this.pos.compute_all(taxes, price, 1, this.pos.currency.rounding);
                return all_taxes.total_included;
            }
        }
        
        return price;
    }
});

return models;

});
