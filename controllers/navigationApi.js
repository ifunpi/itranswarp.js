// user api

var
    _ = require('lodash'),
    async = require('async');
var
    api = require('../api'),
    db = require('../db'),
    auth = require('./_auth'),
    utils = require('./_utils'),
    config = require('../config'),
    constants = require('../constants');

var
    Navigation = db.navigation,
    warp = db.warp,
    next_id = db.next_id;

function getNavigation(id, callback) {
    Navigation.find(id, function(err, nav) {
        if (err) {
            return callback(err);
        }
        if (nav===null) {
            return callback(api.notFound('Navigation'));
        }
        callback(null, nav);
    });
}

function getNavigations(callback) {
    Navigation.findAll({
        order: 'display_order'
    }, callback);
}

function sort(ids, callback) {
    getNavigations(function(err, entities) {
        if (err) {
            return callback(err);
        }
        if (! Array.isArray(ids)) {
            ids = [ids];
        }
        if (entities.length!==ids.length) {
            return callback(api.invalidParam('id', 'Invalid id list.'));
        }
        for (var i=0; i<entities.length; i++) {
            var entity = entities[i];
            var pos = ids.indexOf(entity.id);
            if (pos===(-1)) {
                return callback(api.invalidParam('id', 'Invalid id parameters.'));
            }
            entity.display_order = pos;
        }
        warp.transaction(function(err, tx) {
            if (err) {
                return callback(err);
            }
            async.series(_.map(entities, function(entity) {
                return function(callback) {
                    entity.update(['display_order', 'updated_at', 'version'], tx, callback);
                };
            }), function(err, result) {
                tx.done(err, function(err) {
                    console.log(err===null ? 'tx committed' : 'tx rollbacked');
                    if (err) {
                        return callback(err);
                    }
                    return callback(null, { sort: true });
                });
            });
        });
    });
}

exports = module.exports = {

    getNavigation: getNavigation,

    getNavigations: getNavigations,

    'GET /api/navigations': function(req, res, next) {
        /**
         * Get all navigations.
         */
        getNavigations(function(err, navigations) {
            if (err) {
                return next(err);
            }
            return res.send({ navigations: navigations });
        });
    },

    'POST /api/navigations': function(req, res, next) {
        /**
         * Create a navigation.
         */
        if (utils.isForbidden(req, constants.ROLE_ADMIN)) {
            return next(api.notAllowed('Permission denied.'));
        }
        try {
            var
                name = utils.getRequiredParam('name', req),
                url = utils.getRequiredParam('url', req);
        }
        catch (e) {
            return next(e);
        }
        getNavigations(function(err, navigations) {
            if (err) {
                return next(err);
            }
            var dis = _.map(navigations, function(nav) {
                return nav.display_order;
            });
            var max = dis.length ? _.max(dis) + 1 : 0;
            Navigation.create({
                name: name,
                url: url,
                display_order: max
            }, function(err, nav) {
                if (err) {
                    return next(err);
                }
                return res.send(nav);
            });
        });
    },

    'POST /api/navigations/sort': function(req, res, next) {
        if (utils.isForbidden(req, constants.ROLE_ADMIN)) {
            return next(api.notAllowed('Permission denied.'));
        }
        sort(req.body.id, function(err, r) {
            if (err) {
                return next(err);
            }
            return res.send({ sort: true });
        });
    },

    'POST /api/navigations/:id': function(req, res, next) {
        /**
         * Update a navigation.
         */
        if (utils.isForbidden(req, constants.ROLE_ADMIN)) {
            return next(api.notAllowed('Permission denied.'));
        }
        var
            name = utils.getParam('name', null, req),
            url = utils.getParam('url', null, req);
        if (name!==null && name==='') {
            return next(api.invalidParam('name', 'name cannot be empty.'));
        }
        if (url!==null && url==='') {
            return next(api.invalidParam('url', 'url cannot be empty.'));
        }
        getNavigation(req.params.id, function(err, nav) {
            if (err) {
                return next(err);
            }
            if (name!==null) {
                nav.name = name;
            }
            if (url!==null) {
                nav.url = url;
            }
            nav.update(function(err, entity) {
                if (err) {
                    return next(err);
                }
                return res.send(entity);
            });
        });
    },

}
