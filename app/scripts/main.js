/* global _, cartodb, $, Backbone, L, Vue */

class PaymentsCapabilitiesMap {
  constructor() {
    this.container = document.querySelector('.js-map');
    this.query = `
      SELECT world_borders.*, payments_and_capabilities.currency_name, payments_and_capabilities.currency_symbol, 
        payments_and_capabilities.payments, payments_and_capabilities.collections, payments_and_capabilities.cutoff, 
        payments_and_capabilities.category, payments_and_capabilities.value_date
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
            <tr>
              <td>Value date</td>
              <td>{{ value_date }}</td>
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

  addCartoLayer() {
    cartodb.createLayer(this.map, {
      user_name: 'ebury',
      type: 'cartodb',
      sublayers: [{
        sql: this.query,
        cartocss: this.cartocss.replace('{{ category_code }}', this.currentCategory.code).replace('{{ category_color }}', this.currentCategory.color),
        interactivity: 'currency_name, currency_symbol, payments, collections, cutoff, category, cartodb_id, iso_a3, value_date, name'
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
          payments: 'payments',
          collections: 'collections',
          cutoff: 'cutoff',
          category: 'category',
          value_date: 'value_date'
        }]
    });

    this.cartoLayer.off('mouseover')
      .on('mouseover', (e, latlng, pos, data) => {
        if (data.category === this.currentCategory.code) {
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
        payments: null,
        collections: null,
        cutoff: null,
        valueDate: null,
        info: null
      }
    });
    this.cartoLayer
      .on('mouseover', (e, latlng, pos, data) => {
        if (data.category === this.currentCategory.code) {
          this.container.style.cursor = 'pointer';
        } else {
          this.container.style.cursor = '';
        }
      })
      .on('mouseout', () => {
        this.container.style.cursor = '';
      })
      .on('featureClick', (e, latlng, pos, data) => {
        if (data.category === this.currentCategory.code) {
          this.showCountryInfo(data.name, data.iso_a3);
        }
      });
  }

  showCountryInfo(countryName, countryCode) {
    let sql = new cartodb.SQL({user: 'ebury'});
    let $countryInfo = $(this.countryInfo.$el);
    $countryInfo.addClass('country-info--loading');
    sql.execute("SELECT * FROM payments_and_capabilities WHERE country_iso_code = '{{country}}'", {country: countryCode})
      .done(data => {
        this.countryInfo.countryName = countryName;
        this.countryInfo.currencyName = data.rows[0].currency_name;
        this.countryInfo.currencySymbol = data.rows[0].currency_symbol;
        this.countryInfo.payments = data.rows[0].payments;
        this.countryInfo.collections = data.rows[0].collections;
        this.countryInfo.cutoff = data.rows[0].cutoff;
        this.countryInfo.valueDate = data.rows[0].value_date;
        this.countryInfo.info = data.rows[0].info;
        $countryInfo.modal('show');
        $countryInfo.removeClass('country-info--loading');
      })
      .error(errors => {
        // errors contains a list of errors
        console.log("errors:" + errors);
      });
  }

  handleCategoryChange() {
    $('.js-category')
      .on('change', e => this.changeCategory(parseInt($(e.currentTarget).val())));
  }

  changeCategory(category) {
    this.currentCategory = _.findWhere(this.categories, {code: category});
    this.cartoLayer.setCartoCSS(this.cartocss.replace('{{ category_code }}', this.currentCategory.code).replace('{{ category_color }}', this.currentCategory.color));
  }

}

let map = new PaymentsCapabilitiesMap();