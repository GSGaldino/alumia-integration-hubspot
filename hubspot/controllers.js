const axios = require("axios");
const env = require("../env");
const sheets = require("../google/sheets");
const helpers = require("../helpers");

/**
 * Query the contacts model from the hubspot api
 * @param {String} query the search query
 */
const queryContacts = async (query = "") => {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/contacts/v1/search/query?hapikey=${env.HUBSPOT_API_KEY}&q=${query}`
    );
    return res.data;
  } catch (err) {
    console.log("hubspot/controllers -> queryContacts()", err);
  }
};

/**
 * Get the HubSpot deals IDs associated with a contact
 * @param {String} contactId the HubSpot contact id
 */
const getDealIdsFromContact = async contactId => {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm-associations/v1/associations/${contactId}/HUBSPOT_DEFINED/4?hapikey=${env.HUBSPOT_API_KEY}`
    );
    return res.data;
  } catch (err) {
    console.log("hubspot/controllers -> getDealIdsFromContact()", err);
  }
};

/**
 * Get a HubSpot deal by it's ID
 * @param {String} dealId the HubSpot contact id
 */
const getDeal = async dealId => {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/deals/v1/deal/${dealId}?hapikey=${env.HUBSPOT_API_KEY}`
    );
    return res.data;
  } catch (err) {
    console.log("hubspot/controllers -> getDeal()", err);
  }
};

/**
 * Get the HubSpot deals objects associated with a contact
 * @param {String} contactId the HubSpot contact id
 */
const getDealsFromContact = async contactId => {
  try {
    // Get all the Deal IDs
    const dealIds = (await getDealIdsFromContact(contactId)).results;

    // Get all the deal pipelines
    const pipelines = (await getAllPipelines()).results;

    // Set the deals array
    let deals = [];

    for (let dealId of dealIds) {
      // Get deal detailed info
      let deal = await getDeal(dealId);

      // Get deal pipeline detailed info
      deal.pipeline = pipelines.find(
        p => p.pipelineId === deal.properties.pipeline.value
      );

      // Get deal stage detailed info
      deal.stage = deal.pipeline.stages.find(
        s => s.stageId === deal.properties.dealstage.value
      );

      deals.push(deal); // Push deal to deals array
    }

    return deals;
  } catch (err) {
    console.log("hubspot/controllers -> getDealsFromContact()", err);
  }
};

/**
 * Get Hubspot deals pipeliens
 */
const getAllPipelines = async () => {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm-pipelines/v1/pipelines/deals?hapikey=${env.HUBSPOT_API_KEY}`
    );
    return res.data;
  } catch (err) {
    console.log("hubspot/controllers -> getDeal()", err);
  }
};

// ===============================================================================================================

/**
 * Fetches data from HubSpot API: all contacts endpoint
 * @param {String} vidOffset
 * @returns {Array} HubSpot contacts
 */
const getContacts = async (vidOffset = null, timeOffset = null) => {
  try {
    let pagination = vidOffset ? `&vidOffset=${vidOffset}` : "";
    pagination += timeOffset ? `&timeOffset=${timeOffset}` : "";

    console.log(
      "calling HubSpot API contacts/all",
      `vidOffset=${vidOffset} timeOffset=${timeOffset}`
    );
    const COUNT = 100;
    const res = await axios.get(
      `https://api.hubapi.com/contacts/v1/lists/all/contacts/recent?hapikey=${env.HUBSPOT_API_KEY}&count=${COUNT}${pagination}`
    );

    return res.data;
  } catch (err) {
    console.log("hubspot/controllers -> getContacts()", err);
  }
};

/**
 * Gets detailed information about the contacts passed as an array
 * @param {Array} contacts the contacts you want to get more information from
 * @returns {Array} the contacts array with detailed info about each
 */
const getContactsDetailedInfo = async contacts => {
  try {
    const vidsParam = `&vid=${contacts.map(c => c.vid).join("&vid=")}`;

    const res = await axios.get(
      `https://api.hubapi.com/contacts/v1/contact/vids/batch/?hapikey=${env.HUBSPOT_API_KEY}${vidsParam}`
    );

    let detailedContacts = Object.keys(res.data).map(key => res.data[key]);
    detailedContacts = insertAddedDateOnDetailedContacts(
      contacts,
      detailedContacts
    );
    return detailedContacts;
  } catch (err) {
    console.log("hubspot/controllers -> getContactsDetailedInfo()", err);
  }
};

/**
 * Insert addedAt prop from contacts to detailedContacts
 * @param {Array} contacts
 * @param {Array} detailedContacts
 * @returns {Array} detailedContacts with the added property
 */
const insertAddedDateOnDetailedContacts = (contacts, detailedContacts) => {
  return detailedContacts.map(dc => {
    contact = contacts.find(c => c.vid === dc.vid);
    return {
      ...dc,
      addedAt: contact.addedAt
    };
  });
};

/**
 * Returns a date in the DD/MM/YYYY - HH:mm format and as a string
 * @param {Date|String} date
 * @returns {String} the formatted date string
 */
const formattedDate = date => {
  // Small helper that adds trailing zeros
  const withZeros = num => String(num).padStart(2, "0");

  // Create New data object from the addedAt prop
  const d = new Date(date);

  // Format the addedAt date string
  const formattedDate = `${withZeros(d.getDate())}/${withZeros(
    d.getMonth() + 1
  )}/${withZeros(d.getFullYear())} - ${withZeros(d.getHours())}:${withZeros(
    d.getMinutes()
  )}`;

  return formattedDate;
};

/**
 * Formats each contact as a flat object, on the needed format for our report
 * @param {Object} contact
 * @returns {Object} the formatted contact
 */
const formatContact = contact => {
  // Formatted contact initial template
  let formattedContact = {
    id: contact.vid,
    analytics_source: contact.properties.hs_analytics_source.value,
    hs_url: `https://app.hubspot.com/contacts/6331207/contact/${contact.vid}`,
    addedAt: formattedDate(contact.addedAt)
  };

  // Get HubSpot parameteres needed for the report
  const {
    hs_analytics_first_url,
    hs_analytics_last_url,
    hs_analytics_first_referrer,
    hs_analytics_last_referrer,
    first_conversion_event_name,
  } = contact.properties;

  // Get the form-submissions value needed for the report
  const form_submission_page =
    contact["form-submissions"][0] &&
    contact["form-submissions"][0]["page-url"];

  // Start populating the formatted contact object
  if (
    hs_analytics_first_url ||
    hs_analytics_last_url ||
    hs_analytics_first_referrer ||
    hs_analytics_last_referrer ||
    form_submission_page
  ) {
    // Create array with all the possible URLs that might hold the params we need
    const landingPageUrls = [
      hs_analytics_first_url && hs_analytics_first_url.value,
      hs_analytics_last_url && hs_analytics_last_url.value,
      hs_analytics_first_referrer && hs_analytics_first_referrer.value,
      hs_analytics_last_referrer && hs_analytics_last_referrer.value,
      form_submission_page
    ];

    // Get the query params from the all the URLs inside an object
    let queryParams = {};

    landingPageUrls.forEach(lp => {
      queryParams = {
        ...queryParams,
        ...helpers.getURLParams(lp)
      };
    });

    // Array of formatted institution names
    const INSTITUTIONS = {
      "br.digitalmarketinginstitute.com": "DMI",
      "dmi.espm.br": "ESPM",
      "gestaopublica.fecap.br": "Fecap",
      "posead.institutosingularidades.edu.br": "Singularidades",
      "cursopos.com": "FAT"
    };

    // Get the name of the institution from the hostname of the last_url param
    const institution = hs_analytics_last_url ? INSTITUTIONS[helpers.getHostName(hs_analytics_last_url.value)] : hs_analytics_last_url;

/*     const analytics_source = hs_analytics_source 
        ? hs_analytics_source.value 
        : null; */

    // Source Parameter
    let source = queryParams.utm_source;

    // Setup the formatted contact output object
    formattedContact = {
      ...formattedContact,
      /* analytics_source, */
      institution,
      utm_source: source,
      utm_campaign: queryParams.utm_campaign,
      hsa_grp: queryParams.hsa_grp || queryParams.ad_group,
      utm_content: queryParams.utm_content,
    };

    // Instagram exception
    if (
      source === "facebook" &&
      hs_analytics_first_referrer &&
      hs_analytics_first_referrer.value === "http://instagram.com/"
    ) {
      source = "instagram";
    }

    // Linkedin exceptions
    if (source === "linkedin") {
      if (first_conversion_event_name)
        formattedContact.ad = first_conversion_event_name.value;

     /*  if (hs_analytics_source_data_2)
        formattedContact.utm_campaign = hs_analytics_source_data_2.value; */

      /* if (hs_analytics_source)
        formattedContact.analytics_rource = hs_analytics_source; */
    }
  }
  return formattedContact;
};

/**
 * Formats contacts data and append them to Google Sheet
 * @param {Array} data the array of data to be appended to the google sheet
 * @param {*} sheetId the ID of the sheet. Example: 1XTVt04G7zIc2V8W-OkbYGfrGPbYEbSYlY6DRt_R4-WU
 */
const formatAndAppendToSheet = (data, sheetId, range = "Página1") => {
  // Format array for Google Sheets
  data = data.map(entry => sheets.formatContactForGoogleSheet(entry));

  // Append to google sheets
  sheets.appendToSheet({
    sheetId,
    range,
    data
  });
};

/**
 * Fetches contacts from HubSpot API, looping through its pagination
 * @param {Number} vidOffset Pagination parameter to define the first vid to be fetched
 * @param {Number} timeOffset Pagination parameter to define the first datetime to be fetched
 * @param {Number} vidStop Pagination parameter to define the last vid to be fetched
 * @param {Number} timeStop Pagination parameter to define the last timeStamp to be fetched
 * @param {Object} sheet Contains 2 props: sheetId and range of the google sheet we will append to
 * @param {Array} contacts Contacts fetched on a previous loop iteraction are stored here
 *
 * @returns {Array} All the looped contacts
 */
const loopContacts = async (
  vidOffset = null,
  timeOffset = null,
  vidStop = null,
  timeStop = null,
  sheet,
  contacts = []
) => {
  try {
    // Fetching getContacts() with given parameters
    console.log("=======================================");
    const contactsData = await getContacts(vidOffset, timeOffset);
    console.log("vidOffset", vidOffset, "timeOffset", timeOffset);
    console.log("contactsData.contacts.length", contactsData.contacts.length);

    // Getting detailed info about each contact
    const contactsDetailedInfo = await getContactsDetailedInfo(
      contactsData.contacts
    );

    // Check if we have the timeStop condition and find its index on the array
    const timeStopIndex = contactsDetailedInfo.findIndex(
      c => c.addedAt <= timeStop
    );

    // Slice the array in case of a timeStop condition
    let newContacts =
      timeStopIndex !== -1
        ? contactsDetailedInfo.slice(0, timeStopIndex)
        : contactsDetailedInfo;

    // Check if we have the vidStop condition and find its index on the array
    const vidStopIndex = contactsDetailedInfo.findIndex(c => c.vid === vidStop);

    // Slice the array in case of a vidStop condition
    newContacts =
      vidStopIndex !== -1
        ? contactsDetailedInfo.slice(0, vidStopIndex)
        : contactsDetailedInfo;

    // Parse contacts to the required format
    const formattedContacts = newContacts.map(c => formatContact(c));

    // Appends the newly fetched contacts to google sheet
    formatAndAppendToSheet(formattedContacts, sheet.sheetId, sheet.range);

    // Concat contacts array with most recent fetch
    contacts = [...contacts, ...newContacts];

    // Check if we need to keep looping for more contacts
    if (
      contactsData["has-more"] &&
      vidStopIndex === -1 &&
      timeStopIndex === -1
    ) {
      contacts = await loopContacts(
        contactsData["vid-offset"],
        contactsData["time-offset"],
        vidStop,
        timeStop,
        sheet,
        contacts
      );
    }

    return contacts;
  } catch (err) {
    console.log("hubspot/controllers -> loopContacts()", err);
  }
};

module.exports = { loopContacts, queryContacts, getDealsFromContact };
