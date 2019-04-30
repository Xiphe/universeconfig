'use strict';

const cosmiconfig = require('cosmiconfig');
const minimist = require('minimist');
const path = require('path');

const argv = minimist(process.argv.slice(2));
const ALL = Symbol('all');

async function resolveCosmic(configP, load, opts) {
  const { config, filepath } = (await configP) || {};

  if (!config) {
    return {};
  }

  const extend = config.extends
    ? await resolveCosmic(
        load(path.resolve(path.dirname(filepath), config.extends)),
        load,
        opts,
      )
    : {};
  delete config.extends;

  return opts.merge(
    extend,
    opts.mapAll(
      Object.entries(config).reduce((c, [key, val]) => {
        /* eslint-disable-next-line no-param-reassign */
        c[key] = opts.map(key, val);

        return c;
      }, {}),
    ),
  );
}

async function getConfig(name, { map: m, merge }) {
  const map = (key, val) => (m[key] ? m[key](val) : val);
  const mapAll = m[ALL] || ((a) => a);
  const explorer = cosmiconfig(name);
  const cc = await resolveCosmic(explorer.search(), explorer.load, {
    map,
    mapAll,
    merge,
  });

  const ac = mapAll(
    Object.entries(argv).reduce((c, [key, val]) => {
      const match = key.match(new RegExp(`^${name}-(.*)`));
      if (match) {
        const k = match[1];
        /* eslint-disable-next-line no-param-reassign */
        c[k] = map(k, val);
      }

      return c;
    }, {}),
  );

  const ec = mapAll(
    Object.entries(process.env).reduce((c, [key, val]) => {
      const match = key.match(
        new RegExp(`^${name.toUpperCase().replace(/-/g, '_')}_(.*)`),
      );
      if (match) {
        const k = match[1].toLowerCase().replace(/_/g, '-');
        /* eslint-disable-next-line no-param-reassign */
        c[k] = map(k, val);
      }

      return c;
    }, {}),
  );

  return merge(cc, merge(ec, ac));
}

module.exports = async function uniconfig(
  someName,
  {
    defaults = {},
    env = process.env.NODE_ENV,
    map = {},
    merge: mergeOpts = {},
  },
) {
  const name = Array.isArray(someName) ? someName : [someName];
  const merge = (a, b) => {
    return Object.entries(b).reduce((c, [key, val]) => {
      if (c[key] && mergeOpts[key]) {
        /* eslint-disable-next-line no-param-reassign */
        c[key] = mergeOpts[key](c[key], val);
      } else {
        /* eslint-disable-next-line no-param-reassign */
        c[key] = val;
      }

      return c;
    }, a);
  };
  const opts = { map, merge };

  const res = (await Promise.all([
    ...name.map((n) => getConfig(n, opts)),
    ...name.map((n) => getConfig(`${env}-${n}`, opts)),
  ])).reduce((c, nc) => merge(c, nc), defaults);

  return (await Promise.all([
    getConfig(res.name, opts),
    getConfig(`${env}-${res.name}`, opts),
  ])).reduce((c, nc) => merge(c, nc), res);
};

module.exports.ALL = ALL;
