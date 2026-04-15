odoo.define('weha_pos_self_sync.models_extended', function (require) {
"use strict";

const models = require('point_of_sale.models');
const rpc = require('web.rpc');

/**
 * Extend POS models for lazy loading and performance optimization
 */

// Store original load_server_data
const _super_posmodel = models.PosModel.prototype;

models.PosModel = models.PosModel.extend({
    /**
     * Override to implement lazy loading
     */
    async load_server_data() {
        const self = this;
        
        // First call parent to load config and essential data
        await _super_posmodel.load_server_data.call(this);
        
        // Initialize IndexedDB after config is loaded
        if (this.db && this.db.init_indexed_db) {
            await this.db.init_indexed_db();
        }

        // Check if lazy loading is enabled (config is now loaded)
        if (this.config && this.config.lazy_load_products) {
            console.log('Lazy loading enabled - loading from cache');
            
            // Load products from IndexedDB cache
            await this._load_products_from_cache();
            
            // Load partners from IndexedDB cache
            await this._load_partners_from_cache();
        }

        return true;
    },

    /**
     * Load products from IndexedDB cache
     */
    _load_products_from_cache: async function() {
        var self = this;
        try {
            const limit = (this.config && this.config.initial_product_limit) || 100;
            const cached_products = await this.db.get_products_from_indexeddb(null, limit);
            
            if (cached_products && cached_products.length > 0) {
                console.log(`Loaded ${cached_products.length} products from cache`);
                
                // Convert to Product model instances
                var using_company_currency = this.config.currency_id[0] === this.company.currency_id[0];
                var conversion_rate = this.currency.rate / this.company_currency.rate;
                
                var product_models = _.map(cached_products, function (product) {
                    if (!using_company_currency) {
                        product.lst_price = Math.round(product.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
                    }
                    if (product.categ_id && product.categ_id[0]) {
                        product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                    }
                    product.pos = self;
                    return new models.Product({}, product);
                });
                
                this.db.add_products(product_models);
            } else {
                // No cache, load initial batch from server
                console.log('No product cache, loading from server...');
                await this._load_initial_products_from_server(limit);
            }
        } catch (error) {
            console.error('Error loading products from cache:', error);
            // Fallback to server load
            await this._load_initial_products_from_server(100);
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
                    product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
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
                
                // Add to POS DB
                this.db.add_products(products);
                
                // Cache to IndexedDB
                await this.db.save_products_to_indexeddb(products);
                
                // Trigger UI update
                this.trigger('products-loaded', { category_id, count: products.length });
            }

            return products;

        } catch (error) {
            console.error('Error loading products by category:', error);
            return [];
        }
    },

    /**
     * Search products (lazy loading)
     */
    search_products_server: async function(query) {
        try {
            console.log('Searching products:', query);

            const products = await rpc.query({
                route: '/pos/search_products',
                params: {
                    query: query,
                    session_id: this.pos_session.id,
                    limit: 50
                }
            });

            if (products && products.length > 0) {
                console.log(`Found ${products.length} products for query: ${query}`);
                
                // Add to POS DB
                this.db.add_products(products);
                
                // Cache to IndexedDB
                await this.db.save_products_to_indexeddb(products);
            }

            return products;

        } catch (error) {
            console.error('Error searching products:', error);
            return [];
        }
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

return models;

});
