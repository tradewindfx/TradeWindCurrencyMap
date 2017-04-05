/* global _, cartodb, $, Backbone, L, Vue */

class PaymentsCapabilitiesMap {
  constructor() {
    this.container = document.querySelector('.js-map');
    this.query = `
      SELECT world_borders.*, payments_and_capabilities.currency_name, payments_and_capabilities.currency_symbol, 
        payments_and_capabilities.payments, payments_and_capabilities.payments_in_local_currency, 
        payments_and_capabilities.collections_in_local_currency, payments_and_capabilities.cutoff_payment, 
        payments_and_capabilities.value_date_payment
      FROM world_borders
      LEFT JOIN payments_and_capabilities AS payments_and_capabilities
        ON world_borders.iso_a3=payments_and_capabilities.country_iso_code
      ORDER BY world_borders.labelrank;
    `;
    this.cartocss = `
      #world_borders {
        polygon-fill: #D9D9D9;
        polygon-opacity: 1;
        line-color: #FFF;
        line-width: 0.5;
        line-opacity: 1;
      }
      
      #world_borders[{{ category_code }}=true] {
        polygon-fill: #00BEF0;
      }
      
      #world_borders::labels
      [zoom > 3][labelrank < 3],
      [zoom > 4][labelrank < 4],
      [zoom > 5][labelrank < 5],
      [zoom > 6][labelrank < 6],
      [zoom > 7][labelrank < 7]
      [zoom > 8][labelrank < 8]
      [zoom > 9][labelrank < 9]
      [zoom > 10][labelrank >= 9]
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
        <h6 class="map__tooltip__title">{{ currency_name }}</h6>
        <table class="map__tooltip__data">
          <tbody>
            {{#currency_symbol}}
            <tr>
              <td>Currency</td>
              <td>{{ currency_symbol }}</td>
            </tr>
            {{/currency_symbol}}
            <tr>
              <td>Payments</td>
              <td>{{#payments_in_local_currency}}Yes{{/payments_in_local_currency}}{{^payments_in_local_currency}}No{{/payments_in_local_currency}}</td>
            </tr>
            <tr>
              <td>Collections</td>
              <td>{{#collections_in_local_currency}}Yes{{/collections_in_local_currency}}{{^collections_in_local_currency}}No{{/collections_in_local_currency}}</td>
            </tr>    
            {{#cutoff_payment}}
            <tr>
              <td>Cut off</td>
              <td>{{ cutoff_payment }}</td>
            </tr>
            {{/cutoff_payment}}
            {{#value_date_payment}}
            <tr>
              <td>Value date</td>
              <td>{{ value_date_payment }}</td>
            </tr>
            {{/value_date_payment}}
          </tbody>  
        </table>
      </div>
      `;

    const PAYMENTS = 'payments';
    const PAYMENTS_LOCAL_CURRENCY = 'payments_in_local_currency';
    const COLLECTIONS_LOCAL_CURRENCY = 'collections_in_local_currency';

    this.categories = [
      {
        code: PAYMENTS
      },
      {
        code: PAYMENTS_LOCAL_CURRENCY
      },
      {
        code: COLLECTIONS_LOCAL_CURRENCY
      }
    ];

    this.currentCategory = _.findWhere(this.categories, {code: PAYMENTS});

    this.configureSize();
    this.createMap();
    this.addCartoLayer();
    this.handleCategoryChange();
  }

  configureSize() {
    const config = [
      {
        minScreenWidth: 1200,
        center: [30, 0],
        zoom: 3
      },
      {
        minScreenWidth: 992,
        center: [30, 0],
        zoom: 2
      },
      {
        minScreenWidth: 768,
        center: [30, 0],
        zoom: 2
      },
      {
        minScreenWidth: 0,
        center: [30, 0],
        zoom: 1
      }
    ];
    config.some(c => {
      let screenWidth = $(window).width();
      if (screenWidth >= c.minScreenWidth) {
        this.options = c;
        return true;
      }
    });
  }

  createMap() {
    this.map = new L.Map(this.container, {
      center: this.options.center,
      zoom: this.options.zoom,
      minZoom: this.options.zoom,
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: false
    });

    L.control.zoom({
      position:'topright'
    }).addTo(this.map);
  }

  resetZoom() {
    this.map.setView(new L.LatLng(this.options.center[0], this.options.center[1]), this.options.zoom);
  }

  addCartoLayer() {
    cartodb.createLayer(this.map, {
      user_name: 'ebury',
      type: 'cartodb',
      sublayers: [{
        sql: this.query,
        cartocss: this.cartocss.replace('{{ category_code }}', this.currentCategory.code),
        interactivity: 'currency_name, currency_symbol, payments, payments_in_local_currency, ' +
          'collections_in_local_currency, cutoff_payment, cartodb_id, iso_a3, value_date_payment, name'
      }],
    }, {
      https: true
    })
      .addTo(this.map)
      .on('done', layer => {
        this.cartoLayer = layer.getSubLayer(0);
        this.addTooltip(layer);
        this.handleCountryClick();
      });
  }

  addTooltip(layer) {
    let tooltip = layer.leafletMap.viz.addOverlay({
      type: 'tooltip',
      layer: this.cartoLayer,
      template: this.tooltipTemplate,
      position: 'top|center',
      fields: [
        {
          currency_name: 'currency_name',
          currency_symbol: 'currency_symbol',
          payments_in_local_currency: 'payments_in_local_currency',
          collections_in_local_currency: 'collections_in_local_currency',
          cutoff_payment: 'cutoff_payment',
          value_date_payment: 'value_date_payment'
        }]
    });

    this.cartoLayer.off('mouseover')
      .on('mouseover', (e, latlng, pos, data) => {
        if (data[this.currentCategory.code]) {
          tooltip.show(pos, data);
          tooltip.showing = true;
        }
      });
  }

  handleCountryClick() {
    this.countryInfo = new Vue({
      el: '.js-country-info',
      data: {
        countryName: null,
        currencyName: null,
        currencySymbol: null,
        paymentsInLocalCurrency: null,
        collectionsInLocalCurrency: null,
        cutoff: null,
        valueDate: null,
        info: null
      }
    });
    this.cartoLayer
      .on('mouseover', (e, latlng, pos, data) => {
        if (data[this.currentCategory.code]) {
          this.container.style.cursor = 'pointer';
        } else {
          this.container.style.cursor = '';
        }
      })
      .on('mouseout', () => {
        this.container.style.cursor = '';
      })
      .on('featureClick', (e, latlng, pos, data) => {
        if (data[this.currentCategory.code]) {
          this.showCountryInfo(data.name, data.iso_a3);
        }
      });
  }

  showCountryInfo(countryName, countryCode) {
    let sql = new cartodb.SQL({user: 'ebury'});
    let $countryInfo = $(this.countryInfo.$el);
    $countryInfo.addClass('country-info--loading');
    sql.execute('SELECT * FROM payments_and_capabilities WHERE country_iso_code = \'{{country}}\'', {country: countryCode})
      .done(data => {
        this.countryInfo.countryName = countryName;
        this.countryInfo.currencyName = data.rows[0].currency_name;
        this.countryInfo.currencySymbol = data.rows[0].currency_symbol;
        this.countryInfo.paymentsInLocalCurrency = data.rows[0].payments_in_local_currency;
        this.countryInfo.collectionsInLocalCurrency = data.rows[0].collections_in_local_currency;
        this.countryInfo.cutoff = data.rows[0].cutoff_payment;
        this.countryInfo.valueDate = data.rows[0].value_date_payment;
        this.countryInfo.info = data.rows[0].info;
        $countryInfo.modal('show');
        $countryInfo.removeClass('country-info--loading');
      })
      .error(errors => {
        // errors contains a list of errors
        console.log('errors:' + errors);
      });
  }

  handleCategoryChange() {
    $('.js-category')
      .on('change', e => this.changeCategory($(e.currentTarget).val()));
  }

  changeCategory(category) {
    this.resetZoom();
    this.currentCategory = _.findWhere(this.categories, {code: category});
    this.cartoLayer.setCartoCSS(this.cartocss.replace('{{ category_code }}', this.currentCategory.code));
  }

}

let map = new PaymentsCapabilitiesMap();