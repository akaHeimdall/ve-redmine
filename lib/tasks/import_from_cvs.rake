# Redmine - project management software
# Copyright (C) 2006-2013  Jean-Philippe Lang
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 
#require 'iconv' if RUBY_VERSION < '1.9'
require 'pp'
 
desc <<-END_DESC
Import users, projects, and issues from CSV files.
 
Available options (provide at least one) :
  * users    => the path to a CSV file with one user per line
  * projects => the path to a CSV file with one project per line
  * issues   => the path to a CSV file with one issue per line
 
Example:
  rake redmine:import_from_csv users=/tmp/users.csv projects=/tmp/projects.csv issues=/tmp/issues.csv RAILS_ENV=production
END_DESC
 
namespace :redmine do
  task :import_from_csv => :environment do
 
    #go in rails root so that files paths can be relative
    Dir.chdir(Rails.root)
 
    class CSVImport
      attr_accessor :options, :content, :mappings
 
      def initialize(options)
        @options = options
        @content = {}
        @mappings = {}
      end
 
      # Usage help
      def self.usage
        $stderr.puts 'Missing options! Try: rake -D redmine:import_from_csv to get some help.'
        exit 1
      end
 
      # Global validation step
      def validate
        validate_params
        parse_files
        process_mappings
      end
 
      # Validate params and exits if user don't say "y"
      def validate_params
        puts
        puts "You're about to import data in your '#{Rails.env}' instance."
        puts "You'll use the following source files:"
        puts "  users: #{options['users'] || '-'} "
        puts "  projects: #{options['projects'] || '-'}"
        puts "  issues: #{options['issues'] || '-'}"
        puts
        puts "/!\\ Make sure to have a backup of your database before continuing."
        puts
        print 'Is this ok ? [y/n]: '
        STDOUT.flush
        ok = STDIN.gets.chomp!
        exit 2 if ok != 'y'
        puts
      end
 
      # Try to read each file and parse its CSV content
      def parse_files
        options.each do |type, filename|
          begin
            content[type] = FCSV.read(filename)
          rescue CSV::MalformedCSVError
            $stderr.puts "Error parsing #{filename}: #{$!.message}"
            exit 1
          rescue Errno::ENOENT, Errno::EACCES
            $stderr.puts "Error reading #{filename}: #{$!.message}"
            exit 1
          end
        end
      end
 
      # Validates if fields exist
      def process_mappings
        errors = 0
        content.each do |type, lines|
          fields = lines.shift
          klass = type.classify.constantize
          mappings[type] = []
          fields.each do |field|
            next if field == "project_identifier" && type == "issues"
            if field.match(/^customfield(\d+)$/)
              cf = CustomField.where(:type => "#{klass}CustomField", :id => $1).first
              if cf.present?
                mappings[type] << cf
              else
                $stderr.puts "Unable to find CustomField with type=#{klass}CustomField and id=#{$1}"
                errors += 1
              end
            else
              if klass.column_names.include?(field) || klass.instance_methods.include?(:"#{field}=")
                mappings[type] << field
              else
                $stderr.puts "No field #{klass}##{field}"
                errors += 1
              end
            end
          end
        end
        exit 1 if errors > 0
      end
 
      # Runs the migration
      def run
        errors = []
        puts
        puts "Starting data import."
        puts
        %w(users projects issues).each do |type|
          next unless content[type]
          klass = type.classify.constantize
          print "#{klass}: "
          content[type].each do |attributes|
            object = klass.new
            object.tracker = Tracker.first if klass == Issue
            attributes.each_with_index do |value, index|
              field = mappings[type][index]
              if type == "issues" && field == "project_identifier"
                object.project_id = Project.where("name = ? or name = ?", value, value).first
              elsif field.is_a?(String)
                object.send("#{field}=", value)
              else
                #customfield
                #TODO
              end
            end
            if object.valid?
              print "."
              object.save
            else
              print "E"
              errors << "Cannot save following line in #{type}: #{attributes.join(",")}\n  => errors: #{object.errors.messages.inspect}\n  => object: #{object.inspect}"
            end
          end
          puts
        end
        puts
        if errors.any?
          puts "Errors:"
          errors.each{|e| puts e}
        end
      end
    end
      
    # Extract options
    options = {}
    %w(users projects issues).each do |type|
      options[type] = ENV[type].chomp if ENV[type]
    end
 
    # Exit if no valid params
    CSVImport.usage if options.blank?
 
    importer = CSVImport.new(options)
 
    # Validate input
    importer.validate
 
    # Go!
    old_notified_events = Setting.notified_events
    begin
      # Turn off email notifications temporarily
      Setting.notified_events = []
      # Run the migration
      importer.run
    ensure
      # Restore previous notification settings even if the migration fails
      Setting.notified_events = old_notified_events
    end
  end
end