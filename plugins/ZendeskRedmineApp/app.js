(function () {

    return {

        // Here we define AJAX calls
        requests: {

            updateTicket: function (id, data) {
                return {
                    url: '/api/v2/tickets/' + id + '.json',
                    type: 'PUT',
                    data: data,
                    dataType: 'json',
                    contentType: 'application/json'
                };
            },

            getProjects: function (redmine_url, apiKey) {
                return {
                    url: redmine_url + '/projects.json?key=' + apiKey,
                    type: 'GET',
                    dataType: 'json'
                };
            },

            /*
            getPriorities: function (redmine_url, apiKey) {
                // Not available until 2.2
                return {
                    url: redmine_url + '/projects.json?key=' + apiKey,
                    type: 'GET',
                    dataType: 'json'
                };
            }, */

            getProject: function (redmine_url, apiKey, project_id) {
                return {
                    url: redmine_url + '/projects/' + project_id + '.json?include=trackers&key=' + apiKey,
                    type: 'GET',
                    dataType: 'json'
                };
            },

            getIssue: function (redmine_url, apiKey, redmine_id) {
                return {
                    url: redmine_url + '/issues/' + redmine_id + '.json?key=' + apiKey,
                    type: 'GET',
                    dataType: 'json'
                };
            },

            createIssue: function (redmine_url, apiKey, data) {
                return {
                    url: redmine_url + '/issues.xml?key=' + apiKey,
                    type: 'POST',
                    username: apiKey,
                    password: 'anything',
                    dataType: 'xml',
                    data: data
                };
            },

            updateIssue: function (redmine_url, apiKey, redmine_id, data) {
                return {
                    url: redmine_url + '/issues/' + redmine_id + '.xml?key=' + apiKey,
                    type: 'PUT',
                    dataType: 'xml',
                    data: data
                };
            }
        },

        // Here we define events such as a user clicking on something
        events: {

            // The app is active, so call requestBookmarks (L#65)
            'app.activated': 'appActivated',

            "getProjects.done": function (data) {
                this.project_list = data;
                this.renderRedmine();
                this.requestTrackers();
            },

            'getProjects.fail': function () {
                services.notify("Failed to get Redmine project list", "error");
            },

            'getIssue.done': function (data) {
                this.redmine_data = data;
                this.renderRedmine();
            },

            'getIssue.fail': function () {
                services.notify("Failed to get related Redmine issue status", "error");
            },

            "updateIssue.done": function (data) {
                // services.notify("Updated Redmine issue with back link - PUT222");
            },

            "updateIssue.fail": function () {
                services.notify("Failed to get related Redmine issue status", "error");
            },

            "getProject.done": function (data) {
                var trackers_html = "";
                for (var i = 0; i < data.project.trackers.length; ++i) {
                    var tracker = data.project.trackers[i];
                    trackers_html += "<option value='" + tracker.id + "'>" + tracker.name + "</option>";
                }

                this.$("#input_trackers").html(trackers_html);
            },

            "createIssue.done": function (result) {
                var ticket = this.ticket();

                var xml = this.$(result);
                var id = xml.find("id");
                id = id.text();

                services.notify("Linking ticket to Redmine " + id);
                ticket.customField("custom_field_" + this.settings.redmineIdFieldId, id);
                ticket.status("pending");

                var data = {};
                data.ticket = ticket;

                data = JSON.stringify(data);
                this.ajax('updateTicket', this.ticket().id(), data);

                this.requestRedmine();
            },

            "createIssue.fail": function (data) {
                services.notify("Failed to create Redmine issue: " + data.toString(), "error");
            },

            "updateTicket.done": function (data) {
                this.requestRedmine();
            },

            "updateTicket.fail": function (data) {
                services.notify("Failed to update Zendesk ticket: " + data.toString(), "error");
            },

            "click #button_link": function (event) {
                event.preventDefault();
                var currentRedmineId = this.$("#existing_redmine_id").val();
                services.notify("Linking ticket to Redmine issue " + currentRedmineId);
                this.linkRedmine(currentRedmineId);
            },

            "click #button_unlink": function (event) {
                event.preventDefault();
                services.notify("Unlinking ticket from Redmine");
                this.linkRedmine("");
            },

            "click #button_create": function (event) {
                event.preventDefault();
                var ticketId = this.ticket().id();
                var projectId = this.$("#input_projects").val();
                var priorityId = this.$("#input_priority").val();
                var trackerId = this.$("#input_trackers").val();
                var subject = this.$("#input_subject").val();
                var description = this.$("#input_description").val();

                services.notify("Creating Redmine issue...");

                this.createRedmine(ticketId, projectId, trackerId, priorityId, subject, description);
            },

            "change #input_projects": function (event) {
                this.requestTrackers();
            },

            'fetchBookmarks.always': function (data) {
                this.renderBookmarks((data || {}).bookmarks);
            },

            'click .bookmark': function (event) {
                event.preventDefault();
                this.ajax('addBookmark');
            },

            'addBookmark.always': function (data) {
                this.ajax('fetchBookmarks');
            },

            'addBookmark.done': function () {
                services.notify(this.I18n.t('add.done', { id: this.ticket().id() }));
            },

            'addBookmark.fail': function () {
                services.notify(this.I18n.t('add.failed', { id: this.ticket().id() }), 'error');
            }

        },


        ////////////////////////////

        appActivated: function () {
            this.requestRedmine();
        },

        requestRedmine: function () {
            this.redmine_data = null;

            var ticket = this.ticket();
            var ticketId = ticket.id();
            var redmineId = ticket.customField("custom_field_" + this.settings.redmineIdFieldId);

            if (redmineId != null && redmineId.length !== 0) {
                // Make a call to Redmine
                // services.notify("Getting Redmine issue " + redmineId + " status...");
                this.ajax('getIssue', this.settings.redmine_url, this.settings.apiKey, redmineId);
            }
            else {
                // services.notify("Ticket " + ticketId + " not linked to Redmine.");
            }

            this.ajax('getProjects', this.settings.redmine_url, this.settings.apiKey);
            // TODO: No available until 2.2
            // this.ajax('getPriorities', this.settings.redmine_url, this.settings.apiKey);
        },

        requestTrackers: function () {
            var projectId = this.$("#input_projects").val();
            this.ajax("getProject", this.settings.redmine_url, this.settings.apiKey, projectId);
        },

        renderRedmine: function () {

            // Only render if we received both project listing
            if (this.project_list == null) return;

            var ticket = this.ticket();

            var i = 0;
            var build = "";
            var zendeskIds = [];
            var field;
            if (this.redmine_data != null) {
                // Get the build number from Redmine
                for (i = 0; i < this.redmine_data.issue.custom_fields.length; ++i) {
                    field = this.redmine_data.issue.custom_fields[i];
                    if (field.name == "Build") {
                        build = "." + field.value;
                        break;
                    }
                }

                // Ensure there's a back link to Zendesk
                // This isn't possible yet because Zendesk doesn't support PUT method through its Ajax proxy, it gets converted to a POST
                for (i = 0; i < this.redmine_data.issue.custom_fields.length; ++i) {
                    field = this.redmine_data.issue.custom_fields[i];
                    if (field.id == this.settings.redmine_zdfieldid) {
                        zendeskIds = (field.value + "").split(",");
                        var ticketId = this.settings.zendeskPrefix + ticket.id();
                        if (zendeskIds.indexOf(ticketId) == -1) {
                            zendeskIds.push(ticketId);
                            var data = "<issue>" +
                                "<custom_fields type='array'><custom_field id='" + this.settings.redmine_zdfieldid + "'><value>" + zendeskIds.join() + "</value></custom_field></custom_fields>" +
                                "</issue>";
                            this.ajax("updateIssue", this.settings.redmine_url, this.settings.apiKey, this.redmine_data.issue.id, data);
                        }
                        break;
                    }
                }
            }

            this.switchTo('redmine', {
                redmine_url: this.settings.redmine_url,
                redmine: this.redmine_data,
                redmine_build: build,
                projects: this.project_list
            });
        },

        linkRedmine: function (newRedmineId) {
            var ticket = this.ticket();
            ticket.customField("custom_field_" + this.settings.redmineIdFieldId, newRedmineId);
            ticket.status("pending");

            var zendeskIds = [];
            if (newRedmineId.length === 0 && this.redmine_data != null) {
                // Clear the back link from Redmine
                for (var i = 0; i < this.redmine_data.issue.custom_fields.length; ++i) {
                    var field = this.redmine_data.issue.custom_fields[i];
                    if (field.id == this.settings.redmine_zdfieldid) {
                        zendeskIds = (field.value + "").split(",");
                        var ticketId = this.settings.zendeskPrefix + ticket.id();
                        var index = zendeskIds.indexOf(ticketId);
                        if (index != -1) {
                            zendeskIds.splice(index, 1);
                            var data = "<issue>" +
                                "<custom_fields type='array'><custom_field id='" + this.settings.redmine_zdfieldid + "'><value>" + zendeskIds.join() + "</value></custom_field></custom_fields>" +
                                "</issue>";
                            this.ajax("updateIssue", this.settings.redmine_url, this.settings.apiKey, newRedmineId, data);
                        }
                        break;
                    }
                }
            }

            this.requestRedmine();
        },

        createRedmine: function (zendeskId, projectId, trackerId, priorityId, subject, description) {
            var data = "<issue>" +
                "<subject>" + subject + "</subject>" +
                "<project_id>" + projectId + "</project_id>" +
                "<tracker_id>" + trackerId + "</tracker_id>" +
                "<description>" + description + "</description>" +
                "<priority_id>" + priorityId + "</priority_id>" +
                "<custom_fields type='array'><custom_field id='" + this.settings.redmine_zdfieldid + "'><value>" + this.settings.zendeskPrefix + zendeskId + "</value></custom_field></custom_fields>" +
                "</issue>";

            this.ajax("createIssue", this.settings.redmine_url, this.settings.apiKey, data);
        }


    };

} ());