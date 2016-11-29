function PaymentsCapabilitiesMap() {
  this._init();
}

PaymentsCapabilitiesMap.prototype._init = function () {
  this.query = `
    SELECT world_borders.*, payments_and_capabilities.currency_name, payments_and_capabilities.currency_symbol, 
    payments_and_capabilities.payments, payments_and_capabilities.collections, payments_and_capabilities.cutoff, 
    payments_and_capabilities.category
    FROM world_borders
    LEFT JOIN payments_and_capabilities
    ON world_borders.iso_a3=payments_and_capabilities.country_iso_code
    WHERE world_borders.iso_a3 != 'ATA'
    ORDER BY world_borders.labelrank;
  `;
  this.cartocss = `
    #world_borders{
      polygon-fill: #D9D9D9;
      polygon-opacity: 1;
      line-color: #FFF;
      line-width: 0.5;
      line-opacity: 1;
    }
    
    #world_borders[category={{ category_code }}]{
      polygon-fill: {{ category_color }};
    }
    
    #world_borders::labels
    [zoom >= 3][labelrank < 3],
    [zoom >= 4][labelrank < 4],
    [zoom >= 5][labelrank < 5],
    [zoom >= 6][labelrank < 6],
    [zoom >= 7][labelrank < 7]
    [zoom >= 8][labelrank < 8]
    [zoom >= 9][labelrank < 9]
    [zoom >= 10][labelrank >= 9]
    {
      text-name: [name];
      text-face-name: 'DejaVu Sans Book';
      text-size: 10;
      text-label-position-tolerance: 0;
      text-fill: #000;
      text-allow-overlap: false;
      text-placement: point;
      text-placement-type: simple;
      text-placements: "N,E,S,W";
    }
  `;
  this.tooltipTemplate = `
    <div class="map__tooltip">
      <h6 class="map__tooltip__title">{{currency_name}}</h6>
      <table class="map__tooltip__data">
        <tbody>
          <tr>
            <td>Currency</td>
            <td>{{ currency_symbol }}</td>
          </tr>
          <tr>
            <td>Payments</td>
            <td>{{#payments}}Yes{{/payments}}{{^payments}}No{{/payments}}</td>
          </tr>
         <tr>
            <td>Collections</td>
            <td>{{#collections}}Yes{{/collections}}{{^collections}}No{{/collections}}</td>
          </tr>
          <tr>
            <td>Cut off</td>
            <td>{{ cutoff }}</td>
          </tr>
        </tbody>  
      </table>
    </div>
    `;

  const PAYMENTS_COLLECTIONS_LOCAL_CURRENCY = 1;
  const PAYMENTS_LOCAL_CURRENCY = 2;
  const PAYMENTS_NON_LOCAL_CURRENCY = 3;

  this.categories = [
    {
      code: PAYMENTS_COLLECTIONS_LOCAL_CURRENCY,
      color: '#00C0F0'
    },
    {
      code: PAYMENTS_LOCAL_CURRENCY,
      color: '#9AD7E5'
    },
    {
      code: PAYMENTS_NON_LOCAL_CURRENCY,
      color: '#144257'
    }
  ];

  this.currentCategory = _.findWhere(this.categories, {code: PAYMENTS_COLLECTIONS_LOCAL_CURRENCY});

  this.map = this._createMap();
  this._addCartoLayer();
  this._setUpEvents();
};

PaymentsCapabilitiesMap.prototype._createMap = function () {
  var map = new L.Map(document.querySelector('.js-map'), {
    center: [50, 0],
    zoom: 2,
    zoomControl: false,
    scrollWheelZoom: false,
    tileLayer: {
      continuousWorld: false,
      noWrap: false
    }
  });

  map.fitWorld().zoomIn().panTo(new L.LatLng(50, 0));

  L.control.zoom({
    position:'topright'
  }).addTo(map);

  return map;
};

PaymentsCapabilitiesMap.prototype._addCartoLayer = function () {
  var _this = this;
  cartodb.createLayer(this.map, {
    user_name: 'ebury',
    type: 'cartodb',
    sublayers: [{
      sql: _this.query,
      cartocss: this.cartocss.replace('{{ category_code }}', this.currentCategory.code).replace('{{ category_color }}', this.currentCategory.color),
      interactivity: 'currency_name, currency_symbol, payments, collections, cutoff, category',
    }],
  }, {
    https: true
  })
  .addTo(this.map)
  .on('done', function(layer) {
    _this.cartoLayer = layer.getSubLayer(0);
    var tooltip = layer.leafletMap.viz.addOverlay({
      type: 'tooltip',
      layer: _this.cartoLayer,
      template: _this.tooltipTemplate,
      position: 'top|center',
      fields: [
        {
          currency_name: 'currency_name',
          currency_symbol: 'currency_symbol',
          payments: 'payments',
          collections: 'collections',
          cutoff: 'cutoff',
          category: 'category'
        }]
    });
    tooltip.options.layer.on('mouseover', function(e, latlng, pos, data) {
      if (data.category !== _this.currentCategory.code) {
        tooltip.hide();
      }
    });
  });
};

PaymentsCapabilitiesMap.prototype._setUpEvents = function () {
  var _this = this;
  $('.js-category').change(function () {
    _this._changeCategory(parseInt($(this).val()));
  });
};

PaymentsCapabilitiesMap.prototype._changeCategory = function (category) {
  this.currentCategory = _.findWhere(this.categories, {code: category});
  this.cartoLayer.setCartoCSS(this.cartocss.replace('{{ category_code }}', this.currentCategory.code).replace('{{ category_color }}', this.currentCategory.color));
};

var map = new PaymentsCapabilitiesMap();