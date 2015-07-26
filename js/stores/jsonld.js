var Reflux = require('reflux'),
    host = (process.env.NODE_ENV === 'development') ? 'http://localhost:3000/' : 'http://wrioos.com.s3-website-us-east-1.amazonaws.com/',
    CrossStorageClient = require('cross-storage').CrossStorageClient,
    Promise = (typeof Promise !== 'undefined') ? Promise : require('es6-promise').Promise,
    storage = new CrossStorageClient(host + 'Plus-WRIO-App/widget/storageHub.htm', {
        promise: Promise
    }),
    tools = require('./tools'),
    getJsonldsByUrl = tools.getJsonldsByUrl,
    lastOrder = tools.lastOrder,
    getNext = tools.getNext,
    normURL = require('./normURL'),
    Actions = require('../actions/jsonld');

module.exports = Reflux.createStore({
    listenables: Actions,
    getUrl: function () {
        var theme = 'Default-WRIO-Theme';
        return host + theme + '/widget/defaultList.htm';
    },
    init: function () {
        storage.onConnect().then(function () {
            return storage.get('plus');
        }).then(function (res) {
            if (res) {
                this.data = res;
            } else {
                getJsonldsByUrl(
                    this.getUrl(),
                    this.filterItemList.bind(this)
                );
            }
        }.bind(this));
    },
    pending: 0,
    onData: function (params) {
        var o = params.tab,
            parentName = params.parent,
            key;
        this.data = this.data || {};
        if (parentName) {
            key = o.author;
            if (this.data[key] === undefined) {
                this.data[key] = {
                    name: parentName,
                    url: key,
                    order: o.order
                };
            }
            if (this.data[key].children === undefined) {
                this.data[key].children = {};
            }
            this.data[key].children[o.url] = o;
        } else {
            if (o.author) {
                console.warn('plus: author [' + o.author + '] do not have type Article');
            }
            key = o.url;
            this.data[key] = o;
        }
        this.pending -= 1;
        if (this.pending === 0) {
            storage.onConnect().then(function () {
                return storage.get('plus');
            }).then(function (res) {
                if (JSON.stringify(res) !== JSON.stringify(this.data)) {
                    this.update();
                }
            }.bind(this));
        }
    },
    onDataActive: function (params) {
        var o = params.tab,
            parentName = params.parent,
            key;
        this.data = this.data || {};
        if (o.author) {
            //check parent
            key = o.author;
            if (this.data[key] === undefined) {
                this.data[key] = {
                    name: parentName,
                    url: key,
                    order: lastOrder(this.data) + 1
                };
            }
            if (this.data[key].children === undefined) {
                this.data[key].children = {};
            }
            var children = this.data[key].children;
            //update child
            key = o.url;
            if (children[key]) {
                children[key].active = true;
            } else {
                children[key] = o;
                children[key].order = lastOrder(children);
            }
        } else {
            key = o.url;
            if (this.data[key]) {
                this.data[key].active = true;
            } else {
                this.data[key] = o;
                this.data[key].order = lastOrder(this.data);
            }
        }
    },
    update: function (cb) {
        storage.onConnect()
            .then(function () {
                storage.del('plus');
                storage.set('plus', this.data);
            }.bind(this))
            .then(cb);
    },
    merge: function () {
        this.removeLastActive(this.data);
        this.addCurrentPage(function (params) {
            if (params) {
                this.onDataActive(params);
            }
            this.update();
            this.trigger(this.data);
        });
    },
    removeLastActive: function (obj) {
        Object.keys(obj).forEach(function (key) {
            var o = obj[key];
            if (o.active !== undefined) {
                delete o.active;
            }
            if (o.children) {
                this.removeLastActive(o.children);
            }
        }, this);
    },
    addCurrentPage: function (cb) {
        var scripts = document.getElementsByTagName('script'),
            i,
            json,
            o;
        for (i = 0; i < scripts.length; i += 1) {
            if (scripts[i].type === 'application/ld+json') {
                json = undefined;
                try {
                    json = JSON.parse(scripts[i].textContent);
                } catch (exception) {
                    json = undefined;
                    console.error('Your json-ld not valid: ' + exception);
                }
                if ((typeof json === 'object') && (json['@type'] === 'Article')) {
                    o = {
                        name: json.name,
                        url: normURL(window.location.href),
                        author: normURL(json.author),
                        active: true
                    };
                    break;
                }
            }
        }
        if (o) {
            if (o.author && !this.data[o.author]) {
                getJsonldsByUrl('//' + o.author, function (jsons) {
                    var j, name;
                    for (j = 0; j < jsons.length; j += 1) {
                        if (jsons[j]['@type'] === 'Article') {
                            name = jsons[j].name;
                            j = jsons.length;
                        }
                    }
                    if (!name) {
                        console.warn('plus: author [' + o.author + '] do not have type Article');
                    }
                    cb.call(this, {
                        tab: o,
                        parent: name
                    });
                }.bind(this));
            } else {
                cb.call(this, {
                    tab: o
                });
            }
        } else {
            cb.call(this);
        }
    },
    filterItemList: function (jsons) {
        var items = [];
        jsons.forEach(function (json) {
            if ((json.itemListElement !== undefined) && (json['@type'] === 'ItemList')) {
                items = items.concat(json.itemListElement);
            }
        });
        this.pending += items.length;
        this.core(items);
    },
    core: function (items) {
        items.forEach(function (o, order) {
            o = {
                name: o.name,
                url: normURL(o.url),
                author: normURL(o.author),
                order: order
            };
            var author = o.author;
            if (author) {
                getJsonldsByUrl('//' + author, function (jsons) {
                    var j, name;
                    for (j = 0; j < jsons.length; j += 1) {
                        if (jsons[j]['@type'] === 'Article') {
                            name = jsons[j].name;
                            j = jsons.length;
                        }
                    }
                    this.onData({
                        tab: o,
                        parent: name
                    });
                }.bind(this));
            } else {
                this.onData({
                    tab: o
                });
            }
        }, this);
    },
    getInitialState: function () {
        return this.data;
    },
    onDel: function (listName, elName) {
        var next;
        if (elName === undefined) {
            next = getNext(this.data, listName);
            delete this.data[listName];
        } else {
            next = getNext(this.data[listName], elName);
            delete this.data[listName].children[elName];
            if (Object.keys(this.data[listName].children).length === 0) {
                delete this.data[listName].children;
                this.data[listName].active = true;
            }
        }
        this.update(function () {
            if (next) {
                window.location = '//' + next;
            } else {
                this.trigger(this.data);
            }
        }.bind(this));
    },
    haveData: function () {
        return ((this.data !== null) && (typeof this.data === 'object'));
    },
    onRead: function () {
        if (this.haveData() && (this.pending === 0)) {
            this.merge();
        } else {
            var i = setInterval(function () {
                if (this.haveData() && (this.pending === 0)) {
                    clearInterval(i);
                    this.merge();
                }
            }.bind(this), 100);
        }
    }
});
