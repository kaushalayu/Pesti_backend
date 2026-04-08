const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema({
  companyName: {
    type: String,
    default: 'Safe Home Pestochem India Pvt. Ltd.'
  },
  email: {
    type: String,
    default: 'enquiry@safehomepestochem.in'
  },
  phone: {
    type: String,
    default: '25709'
  },
  website: {
    type: String,
    default: 'www.safehomepestochem.com'
  },
  headOffice: {
    address: {
      type: String,
      default: 'House No. 780-J, Chaksa Husain, Pachpedwa, Ramjanki Nagar, Basaratpur, Gorakhpur-273004'
    },
    city: { type: String, default: 'Gorakhpur' },
    state: { type: String, default: 'UP' },
    pincode: { type: String, default: '273004' }
  },
  regionalOffice: {
    address: {
      type: String,
      default: 'H. No-68, Pink City, Sec. 06, Jankipuram Extn., Near Kendria Vihar Colony, Lucknow-226021'
    },
    city: { type: String, default: 'Lucknow' },
    state: { type: String, default: 'UP' },
    pincode: { type: String, default: '226021' }
  },
  gstNo: {
    type: String,
    default: ''
  },
  cinNo: {
    type: String,
    default: 'U52100UP2022PTC164278'
  },
  tanNo: {
    type: String,
    default: 'ALDS10486A'
  },
  panNo: {
    type: String,
    default: 'ABICS5318P'
  },
  logo: {
    type: String,
    default: ''
  },
  defaultServiceType: {
    type: String,
    default: 'AMC'
  },
  defaultTaxRate: {
    type: String,
    default: '18'
  },
  inventoryMarkupPercent: {
    type: String,
    default: '10'
  },
  inventoryUnits: {
    type: [String],
    default: ['L', 'ML', 'KG', 'G', 'LTR', 'BQ']
  }
}, { timestamps: true });

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
