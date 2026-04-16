odoo.define('weha_smart_pos_online.pos', function (require) {
    "use strict";

    var chrome = require('point_of_sale.chrome');
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var rpc = require('web.rpc');
    var gui = require('point_of_sale.gui');
    var DB = require('point_of_sale.DB');
    var pos_model = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var popup_widget = require('point_of_sale.popups');
    var SuperOrder = models.Order;
    var SuperOrderline = pos_model.Orderline;
    var QWeb = core.qweb;
    var _t = core._t;
    

    chrome.Chrome.include({
        build_widgets: function(){
            this.widgets.push({
                'name':   'network_status_button',
                'widget': NetworkStatusButtonWidget,
                'append':  '.pos-rightheader'
            });
            this._super();
            // this.$el.find('.order-selector').after("<span id=\"rightheader-separator\"></span>");
        }    
    });
        
    var NetworkStatusButtonWidget = PosBaseWidget.extend({
        template: 'NetworkStatusButton',
        init: function(parent, options){
            options = options || {};
            this._super(parent,options);
            // setInterval(this.heartbeat, 5000);
        },
        heartbeat: function() {
            console.log('Ping');
            var self = this;
            rpc.query({
                model: 'pos.session',
                method: 'pong',
                args: [true],
            }).then(function (response) {
                console.log("Online : " + response);
                self.$('.networkstatusbuttton').addClass('online');
                // self.$el.addClass('online');
            }).catch(function (reason){
                console.log(reason)
                console.log("Offline")
                self.$('.networkstatusbuttton').addClass('offline');
                // self.$el.addClass('offline');
                // self.red();
            });
        },
        renderElement: function(){
            var self = this;
            this._super();        
        },
        green(){
            this.$el.addClass('online');
        },
        red(){
            this.$el.addClass('offline');
        },
        hide: function(){
            this.$el.addClass('oe_hidden');
        },
        show: function(){
            this.$el.removeClass('oe_hidden');
        }
    });

});



