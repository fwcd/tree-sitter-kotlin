(source_file [0, 0] - [5, 0]
  (line_comment [0, 0] - [0, 21])
  (function_declaration [2, 0] - [4, 1]
    (simple_identifier [2, 4] - [2, 8])
    (function_value_parameters [2, 8] - [2, 24]
      (parameter [2, 9] - [2, 15]
        (simple_identifier [2, 9] - [2, 10])
        (user_type [2, 12] - [2, 15]
          (type_identifier [2, 12] - [2, 15])))
      (parameter [2, 17] - [2, 23]
        (simple_identifier [2, 17] - [2, 18])
        (user_type [2, 20] - [2, 23]
          (type_identifier [2, 20] - [2, 23]))))
    (function_body [2, 25] - [4, 1]
      (statements [3, 4] - [3, 39]
        (if_expression [3, 4] - [3, 39]
          condition: (comparison_expression [3, 8] - [3, 35]
            (simple_identifier [3, 8] - [3, 9])
            (parenthesized_expression [3, 12] - [3, 35]
              (if_expression [3, 13] - [3, 34]
                condition: (comparison_expression [3, 17] - [3, 24]
                  (simple_identifier [3, 17] - [3, 18])
                  (integer_literal [3, 21] - [3, 24]))
                consequence: (control_structure_body [3, 26] - [3, 27]
                  (integer_literal [3, 26] - [3, 27]))
                alternative: (control_structure_body [3, 33] - [3, 34]
                  (integer_literal [3, 33] - [3, 34])))))
          consequence: (control_structure_body [3, 37] - [3, 39]))))))
