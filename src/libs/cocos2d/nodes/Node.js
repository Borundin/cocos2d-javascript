var util = require('util'),
    event = require('event'),
    Scheduler = require('../Scheduler').Scheduler,
    ActionManager = require('../ActionManager').ActionManager,
    geom = require('geometry'), ccp = geom.ccp;

var Node = BObject.extend(/** @lends cocos.nodes.Node# */{
    isCocosNode: true,
    visible: true,
    position: null,
    parent: null,
    tag: null,
    contentSize: null,
    zOrder: 0,
    anchorPoint: null,
    anchorPointInPixels: null,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    isRunning: false,
    isRelativeAnchorPoint: true,

    isTransformDirty: true,
    isInverseDirty: true,
    inverse: null,
    transformMatrix: null,

    /**
     * The child Nodes
     * @type {Array: cocos.nodes.Node}
     */
    children: null,

    /**
     * @memberOf cocos.nodes
     * @extends BObject
     * @constructs The base class all visual elements extend from
     */
    init: function() {
        this.set('contentSize', {width: 0, height: 0});
        this.anchorPoint = ccp(0.5, 0.5);
        this.anchorPointInPixels = ccp(0, 0);
        this.position = ccp(0,0);
        this.children = [];

        util.each(['scaleX', 'scaleY', 'rotation', 'position', 'anchorPoint', 'contentSize', 'isRelativeAnchorPoint'], util.callback(this, function(key) {
            event.addListener(this, key.toLowerCase() + '_changed', util.callback(this, this._dirtyTransform));
        }));
        event.addListener(this, 'anchorpoint_changed', util.callback(this, this._updateAnchorPointInPixels));
        event.addListener(this, 'contentsize_changed', util.callback(this, this._updateAnchorPointInPixels));
    },

    /** @private
     * Calculates the anchor point in pixels and updates the
     * anchorPointInPixels property
     */
    _updateAnchorPointInPixels: function() {
        var ap = this.get('anchorPoint'),
            cs = this.get('contentSize');
        this.set('anchorPointInPixels', ccp(cs.width * ap.x, cs.height * ap.y));
    },

    /**
     * Add a child Node
     *
     * @param {Options} opts Options
     * @param {cocos.nodes.Node} opts.child The child node to add
     * @param {Integer} [opts.z] Z Index for the child
     * @param {Integer/String} [opts.tag] A tag to reference the child with
     *
     * @returns {cocos.nodes.Node} The node the child was added to. i.e. 'this'
     */
    addChild: function(opts) {
        if (opts.isCocosNode) {
            return arguments.callee.call(this, {child:opts});
        }

        var child = opts['child'],
            z = opts['z'],
            tag = opts['tag'];

        if (z == undefined) {
            z = child.get('zOrder');
        }

        //this.insertChild({child: child, z:z});
        var added = false;

        
        for (var i = 0, childLen = this.children.length; i < childLen; i++) {
            var c = this.children[i];
            if (c.zOrder > z) {
                added = true;
                this.children.splice(i, 0, child);
                break;
            }
        }

        if (!added) {
            this.children.push(child);
        }

        child.set('tag', tag);
        child.set('zOrder', z);
        child.set('parent', this);

        if (this.isRunning) {
            child.onEnter();
        }

        return this;
    },
    getChild: function(opts) {
        var tag = opts['tag'];

        for (var i = 0; i < this.children.length; i++) {
            if (this.children[i].tag == tag) {
                return this.children[i];
            }
        }

        return null;
    },

    removeChild: function(opts) {
        // TODO
    },

    reorderChild: function(opts) {
        var child = opts['child'],
            z     = opts['z'];

        var pos = this.children.indexOf(child);
        if (pos == -1) {
            throw "Node isn't a child of this node";
        }

        child.set('zOrder', z);

        // Remove child
        this.children.splice(pos, 1);

        // Add child back at correct location
        var added = false;
        for (var i = 0, childLen = this.children.length; i < childLen; i++) {
            var c = this.children[i];
            if (c.zOrder > z) {
                added = true;
                this.children.splice(i, 0, child);
                break;
            }
        }

        if (!added) {
            this.children.push(child);
        }
    },

    draw: function(context) {
        // All draw code goes here
    },

    get_scale: function() {
        if (this.scaleX != this.scaleY) {
            throw "scaleX and scaleY aren't identical"
        }

        return this.scaleX;
    },
    set_scale: function(val) {
        this.set('scaleX', val);
        this.set('scaleY', val);
    },

    scheduleUpdate: function(opts) {
        var opts = opts || {},
            priority = opts['priority'] || 0;

        Scheduler.get('sharedScheduler').scheduleUpdate({target: this, priority: priority, paused: !this.get('isRunning')});
    },

    onEnter: function() {
        util.each(this.children, function(child) { child.onEnter(); });

        this.resumeSchedulerAndActions();
        this.set('isRunning', true);
    },
    onExit: function() {
        this.pauseSchedulerAndActions();
        this.set('isRunning', false);

        util.each(this.children, function(child) { child.onExit(); });
    },

    cleanup: function() {
        this.stopAllActions();
        this.unscheduleAllSelectors();
        util.each(this.children, function(child) { child.cleanup(); });
    },

    resumeSchedulerAndActions: function() {
        Scheduler.get('sharedScheduler').resumeTarget(this);
        ActionManager.get('sharedManager').resumeTarget(this);
    },
    pauseSchedulerAndActions: function() {
        Scheduler.get('sharedScheduler').pauseTarget(this);
        ActionManager.get('sharedManager').pauseTarget(this);
    },
    unscheduleAllSelectors: function() {
        Scheduler.get('sharedScheduler').unscheduleAllSelectorsForTarget(this);
    },
    stopAllActions: function() {
        ActionManager.get('sharedManager').removeAllActionsFromTarget(this);
    },

    visit: function(context) {
        if (!this.visible) {
            return;
        }

        context.save();

        this.transform(context);

        // Draw background nodes
        util.each(this.children, function(child, i) {
            if (child.zOrder < 0) {
                child.visit(context);
            }
        });

        this.draw(context);

        // Draw foreground nodes
        util.each(this.children, function(child, i) {
            if (child.zOrder >= 0) {
                child.visit(context);
            }
        });

        context.restore();
    },
    transform: function(context) {
        // Translate
        if (this.isRelativeAnchorPoint && (this.anchorPointInPixels.x != 0 || this.anchorPointInPixels != 0)) {
            context.translate(Math.round(-this.anchorPointInPixels.x), Math.round(-this.anchorPointInPixels.y));
        }

        if (this.anchorPointInPixels.x != 0 || this.anchorPointInPixels != 0) {
            context.translate(Math.round(this.position.x + this.anchorPointInPixels.x), Math.round(this.position.y + this.anchorPointInPixels.y));
        } else {
            context.translate(Math.round(this.position.x), Math.round(this.position.y));
        }

        // Rotate
        context.rotate(geom.degressToRadians(this.get('rotation')));

        // Scale
        context.scale(this.scaleX, this.scaleY);
 
        if (this.anchorPointInPixels.x != 0 || this.anchorPointInPixels != 0) {
            context.translate(Math.round(-this.anchorPointInPixels.x), Math.round(-this.anchorPointInPixels.y));
        }
    },

    runAction: function(action) {
        ActionManager.get('sharedManager').addAction({action: action, target: this, paused: this.get('isRunning')});
    },

    nodeToParentTransform: function() {
        if (this.isTransformDirty) {
            this.transformMatrix = geom.affineTransformIdentity();

            if (!this.isRelativeAnchorPoint && !geom.pointEqualToPoint(this.anchorPointInPixels, ccp(0,0))) {
                this.transformMatrix = geom.affineTransformTranslate(this.transformMatrix, this.anchorPointInPixels.x, this.anchorPointInPixels.y);
            }
            
            if(!geom.pointEqualToPoint(this.position, ccp(0,0))) {
                this.transformMatrix = geom.affineTransformTranslate(this.transformMatrix, this.position.x, this.position.y);
            }

            if(this.rotation != 0) {
                this.transformMatrix = geom.affineTransformRotate(this.transformMatrix, -geom.degressToRadians(this.rotation));
            }
            if(!(this.scaleX == 1 && this.scaleY == 1)) {
                this.transformMatrix = geom.affineTransformScale(this.transformMatrix, this.scaleX, this.scaleY);
            }
            
            if(!geom.pointEqualToPoint(this.anchorPointInPixels, ccp(0,0))) {
                this.transformMatrix = geom.affineTransformTranslate(this.transformMatrix, -this.anchorPointInPixels.x, -this.anchorPointInPixels.y);
            }
            
            this.set('isTransformDirty', false);
                
        }

        return this.transformMatrix;
    },

    parentToNodeTransform: function() {
        // TODO
    },

    nodeToWorldTransform: function() {
        var t = this.nodeToParentTransform();

        var p;
        for (p = this.get('parent'); p; p = p.get('parent')) {
            t = geom.affineTransformConcat(t, p.nodeToParentTransform());
        }

        return t;
    },

    worldToNodeTransform: function() {
        return geom.affineTransformInvert(this.nodeToWorldTransform());
    },

    convertToNodeSpace: function(worldPoint) {
        return geom.pointApplyAffineTransform(worldPoint, this.worldToNodeTransform());
    },

    get_acceptsFirstResponder: function() {
        return false;
    },

    get_becomeFirstResponder: function() {
        return true;
    },

    get_resignFirstResponder: function() {
        return true;
    },

    _dirtyTransform: function() {
        this.set('isTransformDirty', true);
    }
});

module.exports.Node = Node;
